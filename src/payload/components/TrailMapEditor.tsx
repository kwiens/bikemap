'use client';

/**
 * The one map in the trail editor. Five modes over the same view:
 *
 *   Pick ways      click OSM trails to add/remove them. The default, and the
 *                  one to prefer — the geometry then stays maintained upstream,
 *                  where community fixes flow in for free.
 *   Follow trails  click along a trail and the line follows the OSM network
 *                  between clicks (`route-tool.ts`). The fast way to trace a
 *                  trail that is in OSM as part of longer ways.
 *   Draw           click along the trail to extend it. How a trail that isn't in
 *                  OSM at all gets geometry.
 *   Move points    drag the line's points around one at a time. The escape
 *                  hatch for when OSM is wrong or coarse.
 *   Select points  select many points at once — box, click, Shift-click — and
 *                  move, delete, split, join, reverse, or simplify them
 *                  (`point-selection-tool.ts`, `line-edits.ts`).
 *
 * Import GPX replaces the line with a recorded or planned track, then drops into
 * Move points to tidy it up. It is the Draw path with the clicking done by a GPS.
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
 * Single-point dragging, midpoint insertion, deletion, and snapping come from
 * [Terra Draw](https://terradraw.io). Hand-rolling those is a lot of fiddly
 * hit-testing to own, and the version that did got the details wrong in ways
 * that only show up under a real pointer.
 *
 * Terra Draw edits `LineString`s, so a trail's `MultiLineString` parts map to
 * one feature each (`partsToFeatures` / `featuresToParts`) and are joined back
 * up on the way out.
 *
 * **Pick, Follow trails, and Select points stay custom.** OSM ways are
 * vector-tile features from a remote tileset, not features in Terra Draw's
 * store, and Terra Draw has no notion of selecting points across features. In
 * those modes Terra Draw is inert and only draws the line.
 *
 * **Undo is the editor's, not Terra Draw's** (`edit-history.ts`). Every settled
 * edit — a finished drag, a finished piece, one bulk operation — pushes a
 * snapshot of the line before it. Terra Draw keeps only its mode-level history,
 * for taking back points of a piece still being drawn.
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
import { useConfig, useField } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapboxGLAdapter } from 'terra-draw-mapbox-gl-adapter';
import { mapConfig } from '@/config/map.config';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
} from '@/data/osm-trails';
import type { TrailNetworkResponse } from '@/payload/endpoints/trail-network';
import { boundsOf, lengthMeters } from '@/payload/osm/assemble';
import { createEditHistory } from '@/payload/osm/edit-history';
import {
  cloneParts,
  featuresToParts,
  parseTrailGeometry,
  partsToFeatures,
  roundParts,
  samePartsAs,
  toTrailGeometry,
  type TrailGeometry,
} from '@/payload/osm/geometry';
import { MAX_GPX_BYTES, parseGpx } from '@/payload/osm/gpx';
import { parseOsmIds } from '@/payload/osm/ids';
import {
  deletePoints,
  type EditResult,
  joinParts,
  partsOf,
  type PointRef,
  reverseParts,
  simplifyParts,
  splitAtPoints,
} from '@/payload/osm/line-edits';
import { METERS_TO_MILES } from '@/payload/osm/units';
import { OSM_BIKE_TRAIL_FILTER } from '@/utils/map';
import { cn } from '@/lib/utils';
import { Banner, type Tone } from './admin-ui';
import {
  createPointSelectionTool,
  type PointSelectionTool,
} from './point-selection-tool';
import {
  createRouteTool,
  type RouteStatus,
  type RouteTool,
} from './route-tool';
import { removeSelectedLinePointAt } from './terra-draw-point-removal';

type Parts = [number, number][][];
type Mode = 'draw' | 'move' | 'pick' | 'route' | 'select';

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

/** Simplify tolerances offered, in meters. 3 m matches the GPX import's. */
const SIMPLIFY_TOLERANCES_M = [1, 3, 5, 10, 20] as const;

const IDLE_ROUTE: RouteStatus = {
  network: 'idle',
  networkMessage: null,
  note: null,
  waypoints: 0,
};

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
  const { setValue: setTrailName, value: trailName } = useField<string>({
    path: 'trailName',
  });
  const {
    config: {
      routes: { api: apiRoute },
      serverURL,
    },
  } = useConfig();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLSpanElement | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const routeToolRef = useRef<RouteTool | null>(null);
  const selectionToolRef = useRef<PointSelectionTool | null>(null);

  /** The working copy. Written at drag rate, so it cannot live in state. */
  const partsRef = useRef<Parts>([]);
  /**
   * The line as of the last settled edit — what an undo snapshot is taken from.
   * `partsRef` runs ahead of it during a drag or a piece being drawn.
   */
  const settledRef = useRef<Parts>([]);
  /** True while *we* are writing into Terra Draw's store. See the change handler. */
  const loadingRef = useRef(false);
  /** Terra Draw throws if started twice or stopped before starting. */
  const startedRef = useRef(false);
  /** Undo and redo for every edit. See `edit-history.ts`. */
  const historyRef = useRef(createEditHistory());

  const [ready, setReady] = useState(false);
  const [drawFailed, setDrawFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('pick');
  const [basemap, setBasemap] = useState<StyleKey>('streets');
  const [names, setNames] = useState<Record<number, string>>({});
  const [history, setHistory] = useState({ canRedo: false, canUndo: false });
  const [isRemovingPoint, setIsRemovingPoint] = useState(false);
  const [pointRemovalNote, setPointRemovalNote] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<{
    text: string;
    tone: Tone;
  } | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>(IDLE_ROUTE);
  const [selection, setSelection] = useState<PointRef[]>([]);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [toleranceMeters, setToleranceMeters] = useState<number>(3);
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
    const parsed = parseOsmIds(osmIdsValue);
    return parsed.ok ? parsed.ids : [];
  }, [osmIdsValue]);

  // Everything the map's handlers read goes through a ref — see the note above.
  const idsRef = useRef(ids);
  const modeRef = useRef(mode);
  const basemapRef = useRef<StyleKey>('streets');
  const readOnlyRef = useRef(Boolean(readOnly));
  const isRemovingPointRef = useRef(false);
  const sourceRef = useRef(geometrySource);
  const setGeomRef = useRef(setGeom);
  const setOsmIdsRef = useRef(setOsmIds);
  const setSourceRef = useRef(setGeometrySource);
  const apiRef = useRef({ apiRoute, serverURL });
  apiRef.current = { apiRoute, serverURL };
  idsRef.current = ids;
  modeRef.current = mode;
  readOnlyRef.current = Boolean(readOnly);
  isRemovingPointRef.current = isRemovingPoint;
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
   * Lights the toolbar buttons from what can actually be undone.
   *
   * Three sources count: the editor's history, Terra Draw's points of a piece
   * still being drawn, and the clicks of a route still being built.
   */
  const syncHistory = useCallback(() => {
    const draw = drawRef.current;
    const isDrawing = modeRef.current === 'draw';
    setHistory({
      canRedo:
        historyRef.current.canRedo() || (isDrawing && Boolean(draw?.canRedo())),
      canUndo:
        historyRef.current.canUndo() ||
        (isDrawing && Boolean(draw?.canUndo())) ||
        (modeRef.current === 'route' &&
          Boolean(routeToolRef.current?.hasRoute())),
    });
  }, []);

  /**
   * Closes the edit in progress into one undo step.
   *
   * Called when Terra Draw finishes an action — the end of a drag, a finished
   * piece, a deleted point — so a drag that rewrote the line on every frame is
   * still a single Undo. A no-op when nothing has changed since the last one.
   */
  const settle = useCallback(() => {
    if (samePartsAs(settledRef.current, partsRef.current)) {
      return;
    }
    historyRef.current.push(settledRef.current);
    settledRef.current = cloneParts(partsRef.current);
    syncHistory();
  }, [syncHistory]);

  /**
   * Pulls Terra Draw's store back into `parts` and, optionally, the form.
   *
   * The write is conditional on the *line* having actually changed, not merely
   * on a `change` event having fired. Selecting a feature fires three of them,
   * because Terra Draw keeps the drag handles in the same store as the geometry
   * — so committing on every event marked a trail "Edited by hand" and dirtied
   * the form the moment you clicked its line, before touching a single point.
   */
  const readBack = useCallback(
    (write: boolean) => {
      const draw = drawRef.current;
      if (!draw) {
        return;
      }
      const next = featuresToParts(draw.getSnapshot());
      const changed = !samePartsAs(next, partsRef.current);

      partsRef.current = next;
      paintStats();
      if (write && changed) {
        commit();
      }
    },
    [commit, paintStats],
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
    if (sourceRef.current === 'imported') {
      // Selecting a maintainable source is the curator's explicit request to
      // replace a style-only imported line. Without this, imported trails
      // would accept the clicks and then ignore them on save.
      sourceRef.current = 'osm';
      setSourceRef.current('osm');
    }
  }, []);

  /**
   * Replaces Terra Draw's store with the given line.
   *
   * `baseline` says whether this line is a new starting point — a document
   * loading, or a save coming back — in which case there is nothing before it
   * left to undo. Undo, redo, the bulk edits, and a basemap switch pass false,
   * because the history is still every bit as valid as it was a moment ago.
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
      historyRef.current.clear();
      settledRef.current = cloneParts(parts);
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
   * Puts a whole new line on screen and into the form, without touching the
   * history — the callers decide what that step means for undo.
   *
   * Rounded on the way in: the bulk edits and routes compute coordinates, and
   * Terra Draw silently refuses any with more than 9 decimal places.
   */
  const setLine = useCallback(
    (next: Parts) => {
      partsRef.current = roundParts(next);
      settledRef.current = cloneParts(partsRef.current);
      loadDraw(partsRef.current, false);
      paintStats();
      commit();
      selectionToolRef.current?.refresh();
      // A route in progress was built against the old line — it may be set to
      // extend a piece that no longer exists, or is now a different one.
      if (routeToolRef.current?.hasRoute()) {
        routeToolRef.current.cancel();
      }
      // Loading cleared Terra Draw's selection, which is what shows the handles.
      if (modeRef.current === 'move') {
        autoSelect();
      }
      syncHistory();
    },
    [autoSelect, commit, loadDraw, paintStats, syncHistory],
  );

  /**
   * Applies one bulk edit as one undo step.
   *
   * `before` is for a gesture that has been previewing as it went (a group
   * drag): by its end the working line already *is* the result, so the step
   * has to be recorded from where the gesture started.
   */
  const applyEdit = useCallback(
    (next: Parts, before?: Parts) => {
      if (!before) {
        // Any Terra Draw edit not yet closed off becomes its own step first.
        settle();
      }
      const base = before ?? settledRef.current;
      if (samePartsAs(next, base)) {
        if (before) {
          setLine(base);
        }
        return;
      }
      historyRef.current.push(base);
      setLine(next);
    },
    [setLine, settle],
  );

  /** Shows a line mid-gesture. Neither committed nor recorded. */
  const previewLine = useCallback(
    (next: Parts) => {
      partsRef.current = roundParts(next);
      loadDraw(partsRef.current, false);
      paintStats();
    },
    [loadDraw, paintStats],
  );

  /** One of the Select points operations: apply it, keep its selection, say what happened. */
  const runEdit = useCallback(
    (result: EditResult, note: string | null) => {
      applyEdit(result.parts);
      selectionToolRef.current?.setSelection(result.selection);
      setEditNote(note);
    },
    [applyEdit],
  );

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
   * undo history survives too, because it is the editor's rather than Terra
   * Draw's.
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
    loadDraw(partsRef.current, false);
  }, [loadDraw]);

  /** Loads the OSM trail network in one grid cell, for Follow trails. */
  const fetchNetwork = useCallback(
    async (bbox: [number, number, number, number]) => {
      const { apiRoute: api, serverURL: server } = apiRef.current;
      const endpoint = formatAdminURL({
        apiRoute: api,
        path: '/trails/network',
        serverURL: server,
      });
      const response = await fetch(`${endpoint}?bbox=${bbox.join(',')}`, {
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => ({}))) as Partial<
        TrailNetworkResponse & { message: string }
      >;
      if (!response.ok || !Array.isArray(body.ways)) {
        throw new Error(
          body.message ??
            `Trails could not be loaded (HTTP ${response.status}).`,
        );
      }
      return body.ways;
    },
    [],
  );

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
      // Shift-drag is box select in Select points.
      boxZoom: false,
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

    map.on('click', (event) => {
      const draw = drawRef.current;
      if (
        !draw ||
        readOnlyRef.current ||
        modeRef.current !== 'move' ||
        !isRemovingPointRef.current
      ) {
        return;
      }

      const result = removeSelectedLinePointAt(
        draw,
        event.lngLat,
        POINTER_DISTANCE,
      );
      if (result === 'minimum-points') {
        setPointRemovalNote(
          'A line piece needs at least two points. Press Delete to remove the whole selected piece.',
        );
      } else if (result === 'miss') {
        setPointRemovalNote('Click directly on a visible point to remove it.');
      } else {
        setPointRemovalNote(null);
        settle();
      }
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
      // functions.
      //
      // Only the mode level: taking back the last point while still drawing a
      // piece. Completed edits undo through the editor's own history, which
      // also covers what Terra Draw's session level never could — deleted
      // pieces and the bulk edits. Its keyboard shortcuts are left off too;
      // the map's own key handler routes Ctrl+Z to the right stack.
      undoRedo: {
        modeLevel: new TerraDrawModeUndoRedo(),
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
      // The Delete key removes a whole piece without a `finish` event, so it
      // closes its own undo step.
      if (
        type === 'delete' &&
        !loadingRef.current &&
        modeRef.current === 'move'
      ) {
        queueMicrotask(settle);
      }
    });

    // The end of a drag, an inserted or deleted point, a finished piece.
    draw.on('finish', settle);

    // Fires for every push, undo, and redo of a piece still being drawn, so the
    // toolbar reflects what is actually on the stacks.
    draw.on('history', syncHistory);

    const routeTool = createRouteTool(map, {
      apply: (next) => applyEdit(next),
      fetchNetwork,
      getParts: () => partsRef.current,
      isActive: () => !readOnlyRef.current && modeRef.current === 'route',
      onStatus: (status) => {
        setRouteStatus(status);
        syncHistory();
      },
    });
    routeToolRef.current = routeTool;

    const selectionTool = createPointSelectionTool(map, {
      apply: applyEdit,
      getParts: () => partsRef.current,
      isActive: () => !readOnlyRef.current && modeRef.current === 'select',
      onSelection: setSelection,
      preview: previewLine,
    });
    selectionToolRef.current = selectionTool;

    // Fires on the first load *and* on every basemap switch, which discards
    // every source and layer — ours and Terra Draw's alike. So the way layers,
    // the Terra Draw registration, and the tools' layers are all rebuilt here,
    // and `mountDraw` is the only place `draw.start()` is ever called. The
    // tools go last so their points and previews draw above the line.
    map.on('style.load', () => {
      installWayLayers(map);
      applyWayStyle(map, idsRef.current, modeRef.current);
      mountDraw();
      routeTool.install();
      selectionTool.install();
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
      routeToolRef.current = null;
      selectionToolRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [
    applyEdit,
    fetchNetwork,
    mountDraw,
    previewLine,
    readBack,
    settle,
    syncHistory,
    togglePick,
  ]);

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

  // Entering and leaving the custom modes. Leaving Follow trails keeps any
  // route in progress, and a double-click there finishes the route instead of
  // zooming.
  useEffect(() => {
    const map = mapRef.current;
    const routeTool = routeToolRef.current;
    const selectionTool = selectionToolRef.current;
    if (!map || !routeTool || !selectionTool || !ready) {
      return;
    }
    map.getCanvas().style.cursor = '';
    setEditNote(null);
    if (mode === 'route' && editable) {
      map.doubleClickZoom.disable();
      routeTool.activate();
    }
    selectionTool.refresh();
    syncHistory();

    return () => {
      // On unmount the init effect's cleanup has already removed the map, and
      // there is nothing left to finish a route into.
      if (mapRef.current !== map) {
        return;
      }
      if (mode === 'route') {
        map.doubleClickZoom.enable();
        routeTool.deactivate();
        setRouteStatus(IDLE_ROUTE);
      }
      if (mode === 'select') {
        selectionTool.clear();
      }
    };
  }, [editable, mode, ready, syncHistory]);

  useEffect(() => {
    if (mode !== 'move' || !editable) {
      setIsRemovingPoint(false);
      setPointRemovalNote(null);
    }
  }, [editable, mode]);

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
   * Undo, taking back the smallest thing first: a click of the route being
   * built, then a point of the piece being drawn, then the last settled edit.
   */
  const undo = useCallback(() => {
    const draw = drawRef.current;
    if (modeRef.current === 'route' && routeToolRef.current?.undoLeg()) {
      syncHistory();
      return;
    }
    if (modeRef.current === 'draw' && draw?.canUndo()) {
      draw.undo();
      syncHistory();
      return;
    }
    settle();
    const previous = historyRef.current.undo(partsRef.current);
    if (previous) {
      setLine(previous);
      selectionToolRef.current?.clear();
      setEditNote(null);
    }
  }, [setLine, settle, syncHistory]);

  const redo = useCallback(() => {
    const draw = drawRef.current;
    if (modeRef.current === 'draw' && draw?.canRedo()) {
      draw.redo();
      syncHistory();
      return;
    }
    const next = historyRef.current.redo(partsRef.current);
    if (next) {
      setLine(next);
      selectionToolRef.current?.clear();
      setEditNote(null);
    }
  }, [setLine, syncHistory]);

  // --- Select points operations -------------------------------------------
  //
  // Each acts on the selection when there is one, and on the whole line when
  // there isn't — except the two that only make sense on chosen points.

  const deleteSelected = useCallback(() => {
    const chosen = selectionToolRef.current?.selection() ?? [];
    if (chosen.length === 0) {
      return;
    }
    runEdit(
      deletePoints(partsRef.current, chosen),
      `Deleted ${plural(chosen.length, 'point')}.`,
    );
  }, [runEdit]);

  const splitSelected = useCallback(() => {
    const chosen = selectionToolRef.current?.selection() ?? [];
    const before = partsRef.current.length;
    const result = splitAtPoints(partsRef.current, chosen);
    if (result.parts.length === before) {
      setEditNote(
        'Select a point in the middle of a piece to split there — a piece’s end points can’t split it.',
      );
      return;
    }
    runEdit(
      result,
      `Split into ${plural(result.parts.length - before + 1, 'piece')}.`,
    );
  }, [runEdit]);

  const joinSelected = useCallback(() => {
    const chosen = selectionToolRef.current?.selection() ?? [];
    const targets =
      chosen.length > 0
        ? partsOf(chosen)
        : partsRef.current.map((_, index) => index);
    if (targets.length < 2) {
      setEditNote(
        'Select points on at least two pieces to join them, or clear the selection to join every piece.',
      );
      return;
    }
    runEdit(
      joinParts(partsRef.current, targets),
      `Joined ${plural(targets.length, 'piece')} into one. Any gap between them is bridged with a straight line.`,
    );
  }, [runEdit]);

  const reverseSelected = useCallback(() => {
    const chosen = selectionToolRef.current?.selection() ?? [];
    const targets =
      chosen.length > 0
        ? partsOf(chosen)
        : partsRef.current.map((_, index) => index);
    runEdit(
      reverseParts(partsRef.current, targets, chosen),
      `Reversed ${plural(targets.length, 'piece')}.`,
    );
  }, [runEdit]);

  const simplifySelected = useCallback(() => {
    const chosen = selectionToolRef.current?.selection() ?? [];
    const count = (parts: Parts) =>
      parts.reduce((total, part) => total + part.length, 0);
    const before = count(partsRef.current);
    const result = simplifyParts(partsRef.current, toleranceMeters, chosen);
    const after = count(result.parts);
    if (after === before) {
      setEditNote(
        `Nothing to simplify at ${toleranceMeters} m — every point is needed to keep the shape. Try a larger tolerance.`,
      );
      return;
    }
    runEdit(
      result,
      `Simplified ${chosen.length > 0 ? 'the selection' : 'the line'} from ${before.toLocaleString()} to ${after.toLocaleString()} points.`,
    );
  }, [runEdit, toleranceMeters]);

  /**
   * Keys for the map, while it has focus. Undo/redo work in every editing mode;
   * the rest belong to the custom modes, since Terra Draw handles its own.
   */
  const onMapKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnlyRef.current) {
        return;
      }
      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const current = modeRef.current;
      let handled = true;

      // Pick ways has no undo — its Undo button is disabled — and a stray
      // Ctrl+Z there must not revert a line edit and take the trail off OSM.
      if (current === 'pick') {
        handled = false;
      } else if (hasModifier && key === 'z') {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (hasModifier && key === 'y') {
        redo();
      } else if (current === 'route' && event.key === 'Enter') {
        routeToolRef.current?.finish();
      } else if (current === 'route' && event.key === 'Escape') {
        routeToolRef.current?.cancel();
      } else if (current === 'route' && event.key === 'Backspace') {
        routeToolRef.current?.undoLeg();
        syncHistory();
      } else if (
        current === 'select' &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        deleteSelected();
      } else if (current === 'select' && event.key === 'Escape') {
        selectionToolRef.current?.clear();
      } else if (current === 'select' && hasModifier && key === 'a') {
        selectionToolRef.current?.selectAll();
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [deleteSelected, redo, syncHistory, undo],
  );

  /**
   * Replaces the line with a GPX file's tracks.
   *
   * Lands as 'edited' through `commit`, not 'imported': 'imported' means "not
   * maintained here" and skips measuring entirely, whereas a GPX line is ours to
   * adjust and its distance and elevation must follow the line on save.
   *
   * One undo step like any other edit, so replacing an existing line needs no
   * confirmation — Undo puts the old line back.
   */
  const importGpx = useCallback(
    async (file: File) => {
      setImportNote(null);
      if (file.size > MAX_GPX_BYTES) {
        setImportNote({
          text: `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_GPX_BYTES / 1024 / 1024} MB. Trim it to the trail in another tool first.`,
          tone: 'error',
        });
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        setImportNote({
          text: `${file.name} could not be read.`,
          tone: 'error',
        });
        return;
      }
      const parsed = parseGpx(text);
      if (!parsed.ok) {
        setImportNote({ text: `${file.name}: ${parsed.error}`, tone: 'error' });
        return;
      }
      const hadLine = partsRef.current.length > 0;
      applyEdit(parsed.parts);
      // The line no longer comes from the picked ways, and saying they have
      // "changed since this line was built" would send the curator off to
      // rebuild from OSM — the opposite of what they just did.
      setLineWays(idsRef.current);

      const bounds = boundsOf(parsed.parts);
      if (mapRef.current && bounds) {
        mapRef.current.fitBounds(bounds, { padding: 60 });
      }
      if (!trailName?.trim() && parsed.name) {
        setTrailName(parsed.name);
      }
      // Already in Move points, `applyEdit` re-selected the line itself.
      if (modeRef.current !== 'move') {
        setMode('move');
      }

      const kept = parsed.parts.reduce((total, part) => total + part.length, 0);
      const pieces =
        parsed.parts.length > 1 ? ` in ${parsed.parts.length} pieces` : '';
      setImportNote({
        text: `Imported ${file.name}: ${parsed.pointsRead.toLocaleString()} GPS points simplified to ${kept.toLocaleString()}${pieces}. ${hadLine ? 'Undo brings back the previous line. ' : ''}Adjust the line if needed, then save to measure its distance and elevation.`,
        tone: 'info',
      });
    },
    [applyEdit, setTrailName, trailName],
  );

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
      <div className="field-label">Trail line</div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          aria-label="Trail line editing mode"
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          <ModeButton
            active={mode === 'pick'}
            disabled={!editable}
            label="Choose from OpenStreetMap"
            onClick={() => setMode('pick')}
          />
          <ModeButton
            active={mode === 'route'}
            disabled={!editable || drawFailed}
            label="Follow trails"
            onClick={() => setMode('route')}
          />
          <ModeButton
            active={mode === 'draw'}
            disabled={!editable || drawFailed}
            label="Draw line"
            onClick={() => setMode('draw')}
          />
          <ModeButton
            active={mode === 'move'}
            disabled={!editable || drawFailed}
            label="Adjust line"
            onClick={() => setMode('move')}
          />
          <ModeButton
            active={mode === 'select'}
            disabled={!editable || drawFailed || !hasLine}
            label="Select points"
            onClick={() => setMode('select')}
          />
        </div>
        <div
          aria-label="Trail line tools"
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          <ModeButton
            active={false}
            disabled={!editable || !editing || !history.canUndo}
            isToggle={false}
            label="Undo"
            onClick={undo}
          />
          <ModeButton
            active={false}
            disabled={!editable || !editing || !history.canRedo}
            isToggle={false}
            label="Redo"
            onClick={redo}
          />
          <ModeButton
            active={isRemovingPoint}
            disabled={!editable || mode !== 'move' || !hasLine}
            label="Remove point"
            onClick={() => {
              setIsRemovingPoint((current) => !current);
              setPointRemovalNote(null);
            }}
          />
          <ModeButton
            active={false}
            disabled={!editable || !ready || drawFailed}
            isToggle={false}
            label="Import GPX"
            onClick={() => gpxInputRef.current?.click()}
          />
          <input
            accept=".gpx,application/gpx+xml"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so choosing the same file again still fires `change`.
              event.target.value = '';
              if (file) {
                void importGpx(file);
              }
            }}
            ref={gpxInputRef}
            tabIndex={-1}
            type="file"
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
      </div>

      {importNote && <Banner tone={importNote.tone}>{importNote.text}</Banner>}

      {staleNote && <Banner tone="warning">{staleNote}</Banner>}

      {drawFailed && (
        <Banner tone="error">
          The line editor could not attach to the map, so the trail line is
          read-only here. Everything else on this trail still saves normally.
        </Banner>
      )}

      {mode === 'route' && editable && (
        <RouteBar
          onCancel={() => routeToolRef.current?.cancel()}
          onFinish={() => routeToolRef.current?.finish()}
          status={routeStatus}
        />
      )}

      {mode === 'select' && editable && (
        <SelectBar
          onClear={() => selectionToolRef.current?.clear()}
          onDelete={deleteSelected}
          onJoin={joinSelected}
          onReverse={reverseSelected}
          onSelectAll={() => selectionToolRef.current?.selectAll()}
          onSimplify={simplifySelected}
          onSplit={splitSelected}
          onTolerance={setToleranceMeters}
          pieces={parts.length}
          selection={selection}
          toleranceMeters={toleranceMeters}
        />
      )}

      {editNote && (mode === 'select' || mode === 'route') && (
        <p
          aria-live="polite"
          className="mb-2 mt-0 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-elevation-800)]"
        >
          {editNote}
        </p>
      )}

      <div
        aria-label="Trail line map"
        className="h-[480px] w-full rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)]"
        onKeyDown={onMapKeyDown}
        ref={containerRef}
        role="application"
      />

      <div className="flex items-center gap-3 py-2 text-[0.85rem]">
        <strong ref={statsRef}>No line yet</strong>
        <span className="flex-1" />
        {geometrySource === 'edited' && (
          <span className="text-[color:var(--theme-elevation-600)]">
            Drawn here
          </span>
        )}
        {picked.length > 0 && geometrySource === 'edited' && (
          <button
            className="border-0 bg-transparent p-0 text-[0.8rem] text-[color:var(--theme-error-500,#c00)] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-elevation-800)]"
            onClick={revertToOsm}
            type="button"
          >
            Use selected OpenStreetMap trails on next save
          </button>
        )}
      </div>

      <p className="mb-2 mt-0 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.45]">
        {hintFor(
          mode,
          geometrySource,
          hasLine,
          ids.length > 0,
          parts.length,
          isRemovingPoint,
        )}
      </p>

      {pointRemovalNote && (
        <p
          aria-live="polite"
          className="mb-2 mt-0 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-error-500,#c00)]"
        >
          {pointRemovalNote}
        </p>
      )}

      {mode === 'pick' && (
        <div className="mt-1">
          {picked.length === 0 ? (
            <p className="m-0 text-[color:var(--theme-elevation-600)]">
              No OpenStreetMap trail segments selected yet.
            </p>
          ) : (
            <ol className="m-0 pl-5">
              {picked.map((way) => (
                <li className="mb-1" key={way.id}>
                  {way.name}{' '}
                  <a
                    className="text-[0.8rem] underline-offset-2 hover:underline"
                    href={`https://www.openstreetmap.org/way/${way.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    #{way.id}
                  </a>{' '}
                  <button
                    className="border-0 bg-transparent p-0 text-[0.8rem] text-[color:var(--theme-error-500,#c00)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!editable}
                    onClick={() => togglePick(way.id, way.name)}
                    type="button"
                  >
                    Remove
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
  if (!editable || mode === 'pick' || mode === 'route' || mode === 'select') {
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
    return 'The selected OpenStreetMap trails have changed, but this custom line will not be replaced when you save. Use “Use selected OpenStreetMap trails on next save” if you want those changes applied.';
  }

  if (mode === 'pick') {
    return null;
  }

  return hasLine
    ? 'The selected OpenStreetMap trails have changed since this line was built, so the new sections are not part of the editable line yet. Save to rebuild the line, then adjust it.'
    : null;
}

function hintFor(
  mode: Mode,
  source: string,
  hasLine: boolean,
  hasWays: boolean,
  pieces: number,
  isRemovingPoint: boolean,
): string {
  if (mode === 'pick') {
    if (source === 'edited') {
      return 'Click trail segments to select them. Your custom line stays unchanged until you use “Use selected OpenStreetMap trails on next save.”';
    }
    if (source === 'imported') {
      return 'Click a trail segment to start replacing the imported map line with OpenStreetMap. Select segments in riding order, then save to join and store them.';
    }
    return 'Click a trail segment to select it; click it again to remove it. For trails that double back, select segments in riding order. Saving joins those segments into one line and stores it with this trail.';
  }

  const takesOwnership =
    source === 'edited'
      ? ''
      : ' Your first change makes this a custom line, so future saves keep your version instead of replacing it from OpenStreetMap.';

  if (mode === 'route') {
    return `Click where the trail starts, then click further along it — the line follows the trails between clicks. Start on the end of an existing piece to extend it. Hold Alt (Option) while clicking to go straight across a gap. Double-click or press Enter to finish, Backspace to take back a click, Escape to cancel.${takesOwnership}`;
  }

  // The most confusing state in the editor: ways are picked but the line does
  // not exist yet, because it is assembled from Overpass on the server when you
  // save. Without saying so, Move points just looks broken.
  if (!hasLine) {
    return hasWays
      ? 'Nothing to adjust yet. Save this trail to build the line from the selected OpenStreetMap trails, then return here to adjust it.'
      : 'Nothing to adjust yet. Choose OpenStreetMap trails and save, use Follow trails or Draw line to click along the route, or import a GPX file.';
  }

  if (mode === 'draw') {
    return `Click to add points to the line; it snaps to the line’s own points. To trace a trail that is on the map, Follow trails is faster. Press Enter to finish a piece, Escape to cancel it.${takesOwnership}`;
  }
  if (mode === 'select') {
    return `Click a point to select it; Shift- or Ctrl-click to add or remove points; Shift-drag a box to select every point in it. Drag a selected point to move the whole selection. Press Delete to remove the selected points, Escape to clear. With nothing selected, Join, Reverse, and Simplify act on the whole line.${takesOwnership}`;
  }
  // With one piece the editor selects it for you; with several it can't know
  // which one you mean, so say that rather than leaving you to guess why the
  // handles aren't there.
  const selecting =
    pieces > 1
      ? `This trail is in ${pieces} pieces — click one to select it, then `
      : '';

  if (isRemovingPoint) {
    return `${selecting}click a visible point to remove it. Choose Remove point again when you are done. Each removal can be undone.${takesOwnership}`;
  }

  // The two deletions are wildly different in blast radius and only one pixel
  // apart on screen, so they are spelled out separately. An earlier version of
  // this sentence said "click a point and press Delete to remove it", which is
  // the gesture that removes the *whole piece* — following it lost a section of
  // trail, and Terra Draw cannot undo that on its own.
  return `${selecting}drag a point to move it, drag a midpoint to add one, or choose Remove point and click a point. You can also right-click a point to remove it. Press Delete to remove the whole selected piece; Undo brings it back. Distance updates as you drag. Use Calculate and save elevation below after the line is saved.${takesOwnership}`;
}

/** Follow trails' controls, and what the network is doing. */
function RouteBar({
  onCancel,
  onFinish,
  status,
}: {
  onCancel: () => void;
  onFinish: () => void;
  status: RouteStatus;
}) {
  const networkText =
    status.networkMessage ??
    (status.network === 'ready' ? 'Trails loaded for this area.' : null);
  return (
    <div
      aria-label="Follow trails"
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="group"
    >
      <ModeButton
        active={false}
        disabled={status.waypoints < 2}
        isToggle={false}
        label="Finish route"
        onClick={onFinish}
      />
      <ModeButton
        active={false}
        disabled={status.waypoints === 0}
        isToggle={false}
        label="Cancel route"
        onClick={onCancel}
      />
      {networkText && (
        <span
          aria-live="polite"
          className={cn(
            'text-[0.8rem]',
            status.network === 'error'
              ? 'text-[color:var(--theme-error-500,#c00)]'
              : 'text-[color:var(--theme-elevation-600)]',
          )}
        >
          {networkText}
        </span>
      )}
      {status.note && (
        <span
          aria-live="polite"
          className="basis-full text-[0.8rem] text-[color:var(--theme-warning-600,#b45309)]"
        >
          {status.note}
        </span>
      )}
    </div>
  );
}

/** Select points' operations, with the selection they will act on. */
function SelectBar({
  onClear,
  onDelete,
  onJoin,
  onReverse,
  onSelectAll,
  onSimplify,
  onSplit,
  onTolerance,
  pieces,
  selection,
  toleranceMeters,
}: {
  onClear: () => void;
  onDelete: () => void;
  onJoin: () => void;
  onReverse: () => void;
  onSelectAll: () => void;
  onSimplify: () => void;
  onSplit: () => void;
  onTolerance: (meters: number) => void;
  pieces: number;
  selection: PointRef[];
  toleranceMeters: number;
}) {
  const selectedPieces = partsOf(selection).length;
  const hasSelection = selection.length > 0;
  const summary = hasSelection
    ? `${plural(selection.length, 'point')} selected${pieces > 1 ? ` on ${plural(selectedPieces, 'piece')}` : ''}`
    : 'Nothing selected — tools act on the whole line';

  return (
    <div
      aria-label="Point tools"
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="group"
    >
      <span className="mr-1 text-[0.8rem] text-[color:var(--theme-elevation-600)]">
        {summary}
      </span>
      <ModeButton
        active={false}
        isToggle={false}
        label="Select all"
        onClick={onSelectAll}
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Clear"
        onClick={onClear}
      />
      <span
        aria-hidden
        className="mx-1 h-4 w-px bg-[var(--theme-elevation-150)]"
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Delete points"
        onClick={onDelete}
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Split at points"
        onClick={onSplit}
      />
      <ModeButton
        active={false}
        disabled={hasSelection ? selectedPieces < 2 : pieces < 2}
        isToggle={false}
        label="Join pieces"
        onClick={onJoin}
      />
      <ModeButton
        active={false}
        isToggle={false}
        label="Reverse"
        onClick={onReverse}
      />
      <span className="inline-flex items-center gap-1">
        <ModeButton
          active={false}
          isToggle={false}
          label="Simplify"
          onClick={onSimplify}
        />
        <select
          aria-label="Simplify tolerance"
          className="rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] px-1 py-1 text-[0.8rem] text-[color:var(--theme-elevation-800)]"
          onChange={(event) => onTolerance(Number(event.target.value))}
          value={toleranceMeters}
        >
          {SIMPLIFY_TOLERANCES_M.map((meters) => (
            <option key={meters} value={meters}>
              {meters} m
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  isToggle = true,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  isToggle?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isToggle ? active : undefined}
      className={cn(
        'rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)] px-2.5 py-1 text-[0.8rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-elevation-800)] disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-[var(--theme-elevation-800)] text-[color:var(--theme-elevation-0)]'
          : 'bg-[var(--theme-elevation-50)] text-[color:var(--theme-elevation-800)] hover:bg-[var(--theme-elevation-100)]',
      )}
      disabled={disabled}
      onClick={onClick}
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
  // line being worked on — except in Follow trails, where they are what the
  // line follows.
  map.setPaintProperty(
    WAYS_LAYER,
    'line-opacity',
    picking || mode === 'route' ? 1 : 0.35,
  );

  if (map.getLayer(WAYS_HIT_LAYER)) {
    // Off while editing, or a click meant for a point gets eaten by a way.
    map.setLayoutProperty(
      WAYS_HIT_LAYER,
      'visibility',
      picking ? 'visible' : 'none',
    );
  }
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}
