'use client';

/**
 * The one map in the trail editor. Three modes over the same view:
 *
 *   Pick ways    click OSM trails to add/remove them. The default, and the one
 *                to prefer — the geometry then stays maintained upstream, where
 *                community fixes flow in for free.
 *   Move points  drag the line's points around. The escape hatch for when OSM
 *                is wrong or coarse.
 *   Draw         click along the trail to extend it. How a trail that isn't in
 *                OSM at all gets geometry.
 *
 * One map rather than one per field, because picking a way and adjusting the
 * result are the same task at two different distances — two maps meant losing
 * your place on every switch.
 *
 * **Moving or drawing flips the trail to `geometrySource: 'edited'`**, which
 * stops the OSM rebuild for it — otherwise the next save would refetch the ways
 * and throw the edit away. "Discard edits" puts it back.
 *
 * ## Terra Draw owns the line; we own the ways
 *
 * Vertex dragging, midpoint insertion, deletion, snapping, and undo/redo come
 * from [Terra Draw](https://terradraw.io). Hand-rolling those is a lot of fiddly
 * hit-testing to own, and the version that did got the details wrong in ways
 * that only show up under a real pointer.
 *
 * Terra Draw edits `LineString`s, so a trail's `MultiLineString` parts map to
 * one feature each (`partsToFeatures` / `featuresToParts`) and are joined back
 * up on the way out.
 *
 * **Pick mode stays custom.** OSM ways are vector-tile features from a remote
 * tileset, not features in Terra Draw's store — there is nothing for it to edit.
 * That mode is a plain Mapbox click handler on a transparent hit layer.
 *
 * ## Two rules this component lives by
 *
 * Both were bugs in an earlier version, and both are invisible until you put a
 * real pointer on it:
 *
 * 1. Every callback the map's handlers touch must be **referentially stable**,
 *    or the init effect re-runs and calls `map.remove()` mid-interaction.
 *    Anything that closes over a form value is read from a ref instead.
 * 2. Nothing may call `setState` at mousemove rate. A custom field lives inside
 *    Payload's document form, so one `setState` per frame re-renders the whole
 *    form while you drag. The live distance readout is written straight to a
 *    DOM node.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
// The public app pulls this in from its own layout, but the (payload) route
// group is a separate tree — without it the map renders with broken controls.
import 'mapbox-gl/dist/mapbox-gl.css';
import { useField } from '@payloadcms/ui';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
  TerraDrawUndoRedoKeyboardShortcuts,
} from 'terra-draw';
import { TerraDrawMapboxGLAdapter } from 'terra-draw-mapbox-gl-adapter';
import { mapConfig } from '@/config/map.config';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
} from '@/data/osm-trails';
import { boundsOf, lengthMeters } from '@/payload/osm/assemble';
import { createDeletedPieces } from '@/payload/osm/deleted-pieces';
import {
  featuresToParts,
  parseTrailGeometry,
  partsToFeatures,
  samePartsAs,
  toTrailGeometry,
  type TrailGeometry,
} from '@/payload/osm/geometry';
import { METERS_TO_MILES } from '@/payload/osm/units';
import { OSM_BIKE_TRAIL_FILTER } from '@/utils/map';
import { Banner, linkButtonStyle } from './admin-ui';

type Parts = [number, number][][];
type Mode = 'draw' | 'move' | 'pick';

const WAYS_LAYER = 'osm-ways';
const WAYS_HIT_LAYER = 'osm-ways-hit';

const PICKED_COLOR = '#2563EB';
const UNPICKED_COLOR = '#9CA3AF';
const LINE_COLOR = '#2563EB';

/** Terra Draw mode names. `static` is its own name for "registered but inert". */
const SELECT = 'select';
const LINESTRING = 'linestring';
const STATIC = 'static';

/**
 * How close a click has to land, in pixels.
 *
 * Terra Draw's default is tight. Singletrack nodes sit ~10 m apart, which at the
 * zoom you actually edit at is a handful of pixels, so the grab radius is what
 * decides whether this feels usable at all.
 */
const POINTER_DISTANCE = 20;

/**
 * Snapping. Closing a gap between two pieces means landing an endpoint exactly
 * on its neighbour, and doing that by eye is precisely the fiddly part.
 */
const SNAPPING = { toCoordinate: true, toLine: true } as const;

const STYLES = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/outdoors-v12',
} as const;

type StyleKey = keyof typeof STYLES;

export function TrailMapEditor({
  path,
  readOnly,
}: {
  path: string;
  readOnly?: boolean;
}) {
  const { setValue: setGeom, value: geomValue } = useField<
    TrailGeometry | string | null
  >({ path });
  const { setValue: setOsmIds, value: osmIdsValue } = useField<
    number[] | string
  >({ path: 'osmIds' });
  const { setValue: setGeometrySource, value: geometrySource } =
    useField<string>({ path: 'geometrySource' });
  const { setValue: setRebuild } = useField<boolean>({
    path: 'rebuildGeometry',
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLSpanElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);

  /** The working copy. Written at drag rate, so it cannot live in state. */
  const partsRef = useRef<Parts>([]);
  /** True while *we* are writing into Terra Draw's store. See the change handler. */
  const loadingRef = useRef(false);
  /** Terra Draw throws if started twice or stopped before starting. */
  const startedRef = useRef(false);
  /**
   * Undo for deleted pieces, which Terra Draw's own history does not cover.
   * See `deleted-pieces.ts` for why it has to exist.
   */
  const deletedRef = useRef(createDeletedPieces());

  const [ready, setReady] = useState(false);
  const [drawFailed, setDrawFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('pick');
  const [basemap, setBasemap] = useState<StyleKey>('streets');
  const [names, setNames] = useState<Record<number, string>>({});
  const [history, setHistory] = useState({ canRedo: false, canUndo: false });
  /**
   * The ways the line currently on screen was built from.
   *
   * Picking a way does not add it to the line — the line is assembled from
   * Overpass on the server when you save. So a way picked a moment ago has no
   * points on it, and in Move points that reads as "this way is broken" rather
   * than "this way isn't in the line yet". Comparing against this is how the
   * editor can say which it is.
   */
  const [lineWays, setLineWays] = useState<number[]>([]);

  const ids = useMemo<number[]>(() => {
    const raw =
      typeof osmIdsValue === 'string' ? safeParse(osmIdsValue) : osmIdsValue;
    return Array.isArray(raw)
      ? raw.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
  }, [osmIdsValue]);

  // Everything the map's handlers read goes through a ref — see the note above.
  const idsRef = useRef(ids);
  const modeRef = useRef(mode);
  const basemapRef = useRef<StyleKey>('streets');
  const readOnlyRef = useRef(Boolean(readOnly));
  const sourceRef = useRef(geometrySource);
  const setGeomRef = useRef(setGeom);
  const setOsmIdsRef = useRef(setOsmIds);
  const setSourceRef = useRef(setGeometrySource);
  idsRef.current = ids;
  modeRef.current = mode;
  readOnlyRef.current = Boolean(readOnly);
  sourceRef.current = geometrySource;
  setGeomRef.current = setGeom;
  setOsmIdsRef.current = setOsmIds;
  setSourceRef.current = setGeometrySource;

  const editable = !readOnly;

  // --- reading and writing the line --------------------------------------

  /** The live readout, written straight to the DOM — see the note above. */
  const paintStats = useCallback(() => {
    const node = statsRef.current;
    if (!node) {
      return;
    }
    const parts = partsRef.current;
    const points = parts.reduce((total, part) => total + part.length, 0);
    const miles = (lengthMeters(parts) * METERS_TO_MILES).toFixed(2);
    const pieces = parts.length > 1 ? ` · ${parts.length} pieces` : '';
    node.textContent =
      points === 0 ? 'No line yet' : `${miles} mi · ${points} points${pieces}`;
  }, []);

  /**
   * Writes the working line into the form, and takes ownership of it.
   *
   * Flipping the source is what makes the edit survive: an 'osm' trail refetches
   * its ways on the next save and would overwrite whatever was dragged.
   */
  const commit = useCallback(() => {
    setGeomRef.current(toTrailGeometry(partsRef.current));
    if (sourceRef.current !== 'edited') {
      setSourceRef.current('edited');
    }
  }, []);

  /**
   * Pulls Terra Draw's store back into `parts` and, optionally, the form.
   *
   * The write is conditional on the *line* having actually changed, not merely
   * on a `change` event having fired. Selecting a feature fires three of them,
   * because Terra Draw keeps the drag handles in the same store as the geometry
   * — so committing on every event marked a trail "Edited by hand" and dirtied
   * the form the moment you clicked its line, before touching a single point.
   */
  /**
   * Lights the toolbar buttons from what can actually be undone.
   *
   * Terra Draw's own answer is not the whole story: a deleted piece is
   * restorable by us and not by it, so a stack it knows nothing about has to
   * count towards Undo.
   */
  const syncHistory = useCallback(() => {
    const draw = drawRef.current;
    setHistory({
      canRedo: Boolean(draw?.canRedo()),
      canUndo: Boolean(draw?.canUndo()) || deletedRef.current.depth() > 0,
    });
  }, []);

  const readBack = useCallback(
    (write: boolean) => {
      const draw = drawRef.current;
      if (!draw) {
        return;
      }
      const previous = partsRef.current;
      const next = featuresToParts(draw.getSnapshot());
      const changed = !samePartsAs(next, previous);

      // A piece going missing is the one edit Terra Draw's own undo cannot put
      // back, so it gets a snapshot. Rare enough to afford the `setState` that
      // follows — a drag never reaches this branch.
      if (changed && write && deletedRef.current.record(previous, next)) {
        queueMicrotask(syncHistory);
      }

      partsRef.current = next;
      paintStats();
      if (write && changed) {
        commit();
      }
    },
    [commit, paintStats, syncHistory],
  );

  const togglePick = useCallback((id: number, name: string) => {
    const current = idsRef.current;
    // Order is meaningful — it disambiguates trails that double back — so
    // append rather than sort.
    const next = current.includes(id)
      ? current.filter((existing) => existing !== id)
      : [...current, id];
    setNames((previous) => ({ ...previous, [id]: name }));
    setOsmIdsRef.current(next);
  }, []);

  /**
   * Replaces Terra Draw's store with the given line.
   *
   * `baseline` says whether this line is a new starting point — a document
   * loading, or a save coming back — in which case there is nothing before it
   * left to undo. Restoring a deleted piece passes false, because the rest of
   * the undo stack is still every bit as valid as it was a moment ago.
   */
  const loadDraw = useCallback((parts: Parts, baseline = true) => {
    const draw = drawRef.current;
    if (!draw || !startedRef.current) {
      return;
    }

    // Guards the `change` handler from mistaking this for an edit. Reset in a
    // microtask rather than immediately, so it still covers the event if a
    // future version of Terra Draw emits it asynchronously.
    loadingRef.current = true;
    try {
      draw.clear();
      if (parts.length > 0) {
        // `addFeatures` *returns* its failures rather than throwing them. A
        // rejected feature is simply absent — no line, nothing to grab, and
        // nothing in the console — so the result has to be checked.
        const rejected = draw
          .addFeatures(
            partsToFeatures(parts, LINESTRING) as Parameters<
              TerraDraw['addFeatures']
            >[0],
          )
          .filter((validation) => !validation.valid);

        if (rejected.length > 0) {
          console.error(
            'Terra Draw rejected this trail’s geometry',
            rejected.map((validation) => validation.reason),
          );
          setDrawFailed(true);
        }
      }
    } finally {
      queueMicrotask(() => {
        loadingRef.current = false;
      });
    }

    // Whatever is being loaded is the new baseline; undoing past it would be
    // undoing someone else's save.
    if (baseline) {
      draw.clearUndoRedoHistory();
      deletedRef.current.clear();
      setHistory({ canRedo: false, canUndo: false });
    }
  }, []);

  /**
   * Selects the line so its points appear.
   *
   * Terra Draw's select mode only shows coordinate handles for a *selected*
   * feature, so without this, switching to Move points shows a line and no way
   * to grab it — you have to know to click the line first. Only done when there
   * is exactly one piece; with several, which one to edit is the editor's call.
   */
  const autoSelect = useCallback(() => {
    const draw = drawRef.current;
    if (!draw || !startedRef.current) {
      return;
    }
    const lines = draw
      .getSnapshot()
      .filter((feature) => feature.geometry.type === 'LineString');
    if (lines.length === 1 && lines[0].id !== undefined) {
      draw.selectFeature(lines[0].id, SELECT);
    }
  }, []);

  /**
   * Registers Terra Draw against the current style, and restores the line.
   *
   * **Must not run before the style has loaded.** The Mapbox adapter's
   * `register` calls `map.addSource` / `map.addLayer` with no style-loaded guard
   * of its own — no `isStyleLoaded` check, no `styledata` listener — so starting
   * it against a map that is still fetching its style throws and takes the whole
   * trail form down with it.
   *
   * It also has to run *again* after every basemap switch: `setStyle` discards
   * every source and layer, including the adapter's, and it does not put them
   * back. Re-registering is why the line survives a switch to satellite. The
   * undo history does not — a fair trade for not maintaining a fork of the
   * adapter.
   */
  const mountDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }

    if (startedRef.current) {
      try {
        draw.stop();
      } catch {
        // Already stopped; nothing to unregister.
      }
      startedRef.current = false;
    }

    try {
      draw.start();
      startedRef.current = true;
    } catch (error) {
      // A dead editor is bad; a trail page that won't render is worse, because
      // it locks the whole document — including fields that have nothing to do
      // with geometry.
      console.error('Terra Draw could not attach to the map', error);
      setDrawFailed(true);
      return;
    }

    setDrawFailed(false);
    draw.setMode(terraModeFor(modeRef.current, !readOnlyRef.current));
    loadDraw(partsRef.current);
  }, [loadDraw]);

  // --- the map -----------------------------------------------------------

  /**
   * Builds the map and the Terra Draw instance. Runs **once**.
   *
   * Every callback in the dependency list is `useCallback(fn, [])` or depends
   * only on such callbacks, so none change identity and this never re-runs.
   * That is load-bearing: re-running it calls `map.remove()` out from under an
   * in-progress interaction. If you give one of these a dependency that varies —
   * a form value, say — the map will start tearing itself down mid-drag. Read it
   * from a ref instead.
   */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }
    if (!mapConfig.mapbox.accessToken) {
      return;
    }

    mapboxgl.accessToken = mapConfig.mapbox.accessToken;
    const map = new mapboxgl.Map({
      center: mapConfig.defaultView.center,
      container: containerRef.current,
      style: STYLES.streets,
      zoom: mapConfig.defaultView.zoom,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('click', WAYS_HIT_LAYER, (event) => {
      if (readOnlyRef.current || modeRef.current !== 'pick') {
        return;
      }
      const feature = event.features?.[0];
      const osmId = Number(feature?.properties?.OSM_ID);
      if (!Number.isInteger(osmId) || osmId <= 0) {
        return;
      }
      togglePick(osmId, String(feature?.properties?.name ?? `way ${osmId}`));
    });

    map.on('mouseenter', WAYS_HIT_LAYER, () => {
      if (!readOnlyRef.current && modeRef.current === 'pick') {
        map.getCanvas().style.cursor = 'pointer';
      }
    });
    map.on('mouseleave', WAYS_HIT_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });

    const draw = new TerraDraw({
      adapter: new TerraDrawMapboxGLAdapter({ map }),
      modes: [
        new TerraDrawSelectMode({
          flags: {
            [LINESTRING]: {
              feature: {
                coordinates: {
                  deletable: true,
                  draggable: true,
                  midpoints: { draggable: true },
                  snappable: true,
                },
                // Dragging a whole trail somewhere else is never what you meant;
                // only its individual points move.
                draggable: false,
              },
            },
          },
          pointerDistance: POINTER_DISTANCE,
        }),
        new TerraDrawLineStringMode({
          editable: true,
          pointerDistance: POINTER_DISTANCE,
          snapping: SNAPPING,
          styles: { lineStringColor: LINE_COLOR, lineStringWidth: 4 },
        }),
      ],
      // Undo/redo is **opt-in**. Without this the `undo()` and `redo()` methods
      // exist and do nothing at all — the base mode's implementations are empty
      // functions — so the toolbar buttons silently no-op.
      //
      // Both levels are needed, and they cover different things:
      //   sessionLevel  completed actions — a point moved, inserted, or deleted.
      //                 This is what "undo my drag" means.
      //   modeLevel     steps inside an unfinished action — taking back the last
      //                 point while still drawing a line.
      // The coordinator prefers the mode stack while drawing and the session
      // stack otherwise, so wiring both makes Undo mean the obvious thing in
      // either mode.
      undoRedo: {
        keyboardShortcuts: new TerraDrawUndoRedoKeyboardShortcuts(),
        modeLevel: new TerraDrawModeUndoRedo(),
        sessionLevel: new TerraDrawSessionUndoRedo(),
      },
    });
    drawRef.current = draw;

    // Terra Draw fires `change` for its own edits *and* for our own writes into
    // its store, and the event carries nothing to tell them apart — so we track
    // it. Without this, loading the stored line looks like an edit: the trail
    // would flip to "Edited by hand" and the form would go dirty on open,
    // before anyone touched anything.
    draw.on('change', (_changedIds, type) => {
      if (type === 'styling') {
        return;
      }
      readBack(!loadingRef.current && !readOnlyRef.current);
    });

    // Fires for every push, undo, and redo, from the buttons or the keyboard
    // shortcuts — so the toolbar reflects what is actually on the stacks rather
    // than offering an Undo that would do nothing.
    draw.on('history', syncHistory);

    // Fires on the first load *and* on every basemap switch, which discards
    // every source and layer — ours and Terra Draw's alike. So both the way
    // layers and the Terra Draw registration are rebuilt here, and `mountDraw`
    // is the only place `draw.start()` is ever called.
    map.on('style.load', () => {
      installWayLayers(map);
      applyWayStyle(map, idsRef.current, modeRef.current);
      mountDraw();
      setReady(true);
    });

    return () => {
      try {
        draw.stop();
      } catch {
        // Throws if it was never started; there is nothing to clean up then.
      }
      startedRef.current = false;
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [mountDraw, readBack, syncHistory, togglePick]);

  // Mode governs what Terra Draw is doing and how the ways layer looks.
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map || !ready) {
      return;
    }

    if (startedRef.current) {
      draw.setMode(terraModeFor(mode, editable));
      if (mode === 'move' && editable) {
        autoSelect();
      }
    }
    applyWayStyle(map, ids, mode);
  }, [autoSelect, editable, ids, mode, ready]);

  // Basemap switching. Satellite is what you want when checking a line against
  // the singletrack visible on the ground. `style.load` fires again afterwards,
  // which is what re-registers Terra Draw and restores the line — the adapter
  // does not survive a `setStyle` on its own.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapRef.current === basemap) {
      return;
    }
    basemapRef.current = basemap;
    map.setStyle(STYLES[basemap]);
  }, [basemap]);

  // Pull the stored line in — on first load, and after a save replaces it with
  // the server's rebuilt version.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) {
      return;
    }
    const incoming = parseTrailGeometry(geomValue).parts ?? [];
    if (samePartsAs(incoming, partsRef.current)) {
      return;
    }

    partsRef.current = incoming;
    loadDraw(incoming);
    paintStats();
    // Whatever ways are on the record right now are the ones this line came
    // from — the server rebuilt it from them on the save that produced it.
    setLineWays(idsRef.current);

    const map = mapRef.current;
    const bounds = boundsOf(incoming);
    if (map && bounds) {
      map.fitBounds(bounds, { animate: false, padding: 60 });
    }
  }, [geomValue, loadDraw, paintStats, ready]);

  /**
   * Undo, over both stacks.
   *
   * Terra Draw's is tried first and covers everything it can, which is every
   * coordinate edit. Deleting a whole piece is the exception: it reports the
   * undo as successful and leaves the piece deleted, so a *successful* undo
   * that moved nothing is the signal to fall back to our own snapshot.
   */
  const undo = useCallback(() => {
    const before = partsRef.current;
    if (drawRef.current?.undo()) {
      readBack(true);
    }
    if (!samePartsAs(partsRef.current, before)) {
      syncHistory();
      return;
    }

    const restored = deletedRef.current.restore();
    if (restored) {
      partsRef.current = restored;
      loadDraw(restored, false);
      paintStats();
      commit();
    }
    syncHistory();
  }, [commit, loadDraw, paintStats, readBack, syncHistory]);

  const redo = useCallback(() => {
    if (drawRef.current?.redo()) {
      readBack(true);
    }
  }, [readBack]);

  const revertToOsm = useCallback(() => {
    setGeometrySource('osm');
    setRebuild(true);
  }, [setGeometrySource, setRebuild]);

  // --- render ------------------------------------------------------------

  if (!mapConfig.mapbox.accessToken) {
    return (
      <div className="field-type">
        <p>
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to edit trails on the map.
        </p>
      </div>
    );
  }

  const picked = ids.map((id) => ({ id, name: names[id] ?? `way ${id}` }));
  // Derived from the form value rather than the working copy, so it stays
  // reactive without a setState anywhere near the drag path.
  const parts = parseTrailGeometry(geomValue).parts ?? [];
  const hasLine = parts.length > 0;
  const staleNote = staleLineNote(mode, ids, lineWays, geometrySource, hasLine);
  const editing = mode !== 'pick' && !drawFailed;

  return (
    <div className="field-type">
      <label className="field-label" htmlFor={path}>
        Trail geometry
      </label>

      <div style={toolbar}>
        <ModeButton
          active={mode === 'pick'}
          disabled={!editable}
          label="Pick ways"
          onClick={() => setMode('pick')}
        />
        <ModeButton
          active={mode === 'move'}
          disabled={!editable || drawFailed}
          label="Move points"
          onClick={() => setMode('move')}
        />
        <ModeButton
          active={mode === 'draw'}
          disabled={!editable || drawFailed}
          label="Draw"
          onClick={() => setMode('draw')}
        />
        <span style={{ flex: 1 }} />
        <ModeButton
          active={false}
          disabled={!editable || !editing || !history.canUndo}
          label="Undo"
          onClick={undo}
        />
        <ModeButton
          active={false}
          disabled={!editable || !editing || !history.canRedo}
          label="Redo"
          onClick={redo}
        />
        <ModeButton
          active={basemap === 'satellite'}
          disabled={false}
          label="Satellite"
          onClick={() =>
            setBasemap((current) =>
              current === 'satellite' ? 'streets' : 'satellite',
            )
          }
        />
      </div>

      {staleNote && <Banner tone="warning">{staleNote}</Banner>}

      {drawFailed && (
        <Banner tone="error">
          The line editor could not attach to the map, so the geometry is
          read-only here. Everything else on this trail still saves normally.
        </Banner>
      )}

      <div ref={containerRef} style={mapFrame} />

      <div style={statsRow}>
        <strong ref={statsRef}>No line yet</strong>
        <span style={{ flex: 1 }} />
        {geometrySource === 'edited' && (
          <span style={{ color: 'var(--theme-elevation-500)' }}>
            edited by hand
          </span>
        )}
        {picked.length > 0 && geometrySource === 'edited' && (
          <button onClick={revertToOsm} style={linkButton} type="button">
            Discard edits and rebuild from OSM
          </button>
        )}
      </div>

      <p style={hint}>
        {hintFor(mode, geometrySource, hasLine, ids.length > 0, parts.length)}
      </p>

      {mode === 'pick' && (
        <div style={{ marginTop: '0.25rem' }}>
          {picked.length === 0 ? (
            <p style={{ color: 'var(--theme-elevation-500)', margin: 0 }}>
              No ways picked yet.
            </p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {picked.map((way) => (
                <li key={way.id} style={{ marginBottom: '0.25rem' }}>
                  {way.name}{' '}
                  <a
                    href={`https://www.openstreetmap.org/way/${way.id}`}
                    rel="noreferrer"
                    target="_blank"
                    style={{ fontSize: '0.8rem' }}
                  >
                    #{way.id}
                  </a>{' '}
                  <button
                    disabled={!editable}
                    onClick={() => togglePick(way.id, way.name)}
                    style={linkButton}
                    type="button"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Maps a toolbar mode onto a Terra Draw mode.
 *
 * `static` is Terra Draw's own name for "registered but inert" — it keeps
 * rendering the line without offering to edit it, which is what Pick ways and
 * a read-only form both want.
 */
function terraModeFor(mode: Mode, editable: boolean): string {
  if (!editable || mode === 'pick') {
    return STATIC;
  }
  return mode === 'draw' ? LINESTRING : SELECT;
}

/**
 * Warns when the line on screen no longer matches the picked ways.
 *
 * This is the trap the editor kept walking into: pick a way, switch to Move
 * points, and find nothing to grab on it. The way is drawn — it is an OSM
 * tileset feature — but it is not part of the line, because the line is
 * assembled from Overpass server-side on save. Nothing said so, so it just
 * looked broken.
 */
function staleLineNote(
  mode: Mode,
  ids: number[],
  lineWays: number[],
  source: string,
  hasLine: boolean,
): string | null {
  const sameWays =
    ids.length === lineWays.length &&
    ids.every((id, index) => id === lineWays[index]);

  if (sameWays) {
    return null;
  }

  // An edited line has stopped tracking the ways altogether, so saying "save to
  // rebuild" would be a lie — saving deliberately will not touch it.
  if (source === 'edited') {
    return 'The picked ways have changed, but this line is edited by hand so saving will not rebuild it from them. Use “Discard edits and rebuild from OSM” if you want the new ways applied.';
  }

  if (mode === 'pick') {
    return null;
  }

  return hasLine
    ? 'The picked ways have changed since this line was built, so the newly picked ones have no points on them yet. Save to rebuild the line, then edit it.'
    : null;
}

function hintFor(
  mode: Mode,
  source: string,
  hasLine: boolean,
  hasWays: boolean,
  pieces: number,
): string {
  if (mode === 'pick') {
    return 'Click a trail to add it, click again to remove. Order matters for trails that double back — pick them in riding order. Saving rebuilds the line from these ways.';
  }

  // The most confusing state in the editor: ways are picked but the line does
  // not exist yet, because it is assembled from Overpass on the server when you
  // save. Without saying so, Move points just looks broken.
  if (!hasLine) {
    return hasWays
      ? 'Nothing to edit yet — the line is rebuilt from the picked ways when you save. Save this trail, then come back here to adjust it.'
      : 'Nothing to edit yet. Pick some OSM ways and save, or switch to Draw and click along the trail to lay one down by hand.';
  }

  const takesOwnership =
    source === 'edited'
      ? ''
      : ' The first change switches this trail to “Edited by hand”, so saving stops refetching it from OSM.';

  if (mode === 'draw') {
    return `Click to add points to the line; it snaps to nearby trails and points. Press Enter to finish a piece, Escape to cancel it.${takesOwnership}`;
  }
  // With one piece the editor selects it for you; with several it can't know
  // which one you mean, so say that rather than leaving you to guess why the
  // handles aren't there.
  const selecting =
    pieces > 1
      ? `This trail is in ${pieces} pieces — click one to select it, then `
      : '';

  // The two deletions are wildly different in blast radius and only one pixel
  // apart on screen, so they are spelled out separately. An earlier version of
  // this sentence said "click a point and press Delete to remove it", which is
  // the gesture that removes the *whole piece* — following it lost a section of
  // trail, and Terra Draw cannot undo that on its own.
  return `${selecting}drag a point to move it, drag a midpoint to add one, or right-click a point to remove it. Press Delete to remove the whole selected piece — useful for dropping a stray section, and Undo brings it back. Distance updates as you drag; elevation is recalculated on save.${takesOwnership}`;
}

function ModeButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active
          ? 'var(--theme-elevation-800)'
          : 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 'var(--style-radius-s, 4px)',
        color: active
          ? 'var(--theme-elevation-0)'
          : 'var(--theme-elevation-800)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.8rem',
        opacity: disabled ? 0.5 : 1,
        padding: '0.25rem 0.6rem',
      }}
      type="button"
    >
      {label}
    </button>
  );
}

/**
 * The nationwide OSM trails, and a transparent hit layer over them.
 *
 * These are vector-tile features from a remote tileset, so they are ours to
 * handle rather than Terra Draw's — there is nothing in its store to edit. The
 * wide transparent line is what makes them clickable; singletrack rendered at
 * its true width is far too thin to hit reliably.
 */
function installWayLayers(map: mapboxgl.Map) {
  if (!map.getSource(OSM_TRAILS_SOURCE_ID)) {
    map.addSource(OSM_TRAILS_SOURCE_ID, {
      type: 'vector',
      url: OSM_TRAILS_TILEJSON_URL,
    });
  }

  map.addLayer({
    id: WAYS_LAYER,
    filter: OSM_BIKE_TRAIL_FILTER,
    paint: {
      'line-color': UNPICKED_COLOR,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
    },
    source: OSM_TRAILS_SOURCE_ID,
    'source-layer': OSM_TRAILS_SOURCE_LAYER,
    type: 'line',
  });

  map.addLayer({
    id: WAYS_HIT_LAYER,
    filter: OSM_BIKE_TRAIL_FILTER,
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
    source: OSM_TRAILS_SOURCE_ID,
    'source-layer': OSM_TRAILS_SOURCE_LAYER,
    type: 'line',
  });
}

/** Highlights the picked ways, and dims them all while the line is being edited. */
function applyWayStyle(map: mapboxgl.Map, ids: number[], mode: Mode) {
  if (!map.getLayer(WAYS_LAYER)) {
    return;
  }
  const picking = mode === 'pick';

  const isPicked = [
    'in',
    ['to-string', ['get', 'OSM_ID']],
    ['literal', ids.map(String)],
  ];

  map.setPaintProperty(WAYS_LAYER, 'line-color', [
    'case',
    isPicked,
    PICKED_COLOR,
    UNPICKED_COLOR,
  ]);
  // `zoom` may only appear at the top level of an `interpolate`/`step`, so the
  // picked/unpicked choice goes in the interpolation *outputs* rather than
  // wrapping the interpolation in a `case` — that form is rejected outright and
  // leaves the layer unstyled.
  map.setPaintProperty(WAYS_LAYER, 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    ['case', isPicked, 4, 1.5],
    16,
    ['case', isPicked, 7, 4],
  ]);
  // Dimmed while editing so they stay as context without competing with the
  // line being worked on.
  map.setPaintProperty(WAYS_LAYER, 'line-opacity', picking ? 1 : 0.35);

  if (map.getLayer(WAYS_HIT_LAYER)) {
    // Off while editing, or a click meant for a point gets eaten by a way.
    map.setLayoutProperty(
      WAYS_HIT_LAYER,
      'visibility',
      picking ? 'visible' : 'none',
    );
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const hint = {
  color: 'var(--theme-elevation-500)',
  fontSize: '0.8rem',
  margin: '0 0 0.5rem',
} as const;

const toolbar = {
  alignItems: 'center',
  display: 'flex',
  gap: '0.4rem',
  marginBottom: '0.4rem',
} as const;

const mapFrame = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s, 4px)',
  height: 480,
  width: '100%',
} as const;

const statsRow = {
  alignItems: 'center',
  display: 'flex',
  fontSize: '0.85rem',
  gap: '0.75rem',
  padding: '0.5rem 0',
} as const;

const linkButton = {
  ...linkButtonStyle('danger'),
  fontSize: '0.8rem',
  textDecoration: 'none',
} as const;
