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
 * makes the line curator-owned. Otherwise the save hook treats it as OSM-owned
 * and restores the last reviewed OSM line, throwing the point edit away.
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
 * The editor's history (`edit-history.ts`) records settled changes, including
 * one step per click when adding a line. Terra Draw keeps the mode-level
 * history for a piece still being drawn. An editor snapshot also records
 * who owned the line (`LineOwner`), so undoing past the first hand edit, or past
 * an OSM refresh, puts the trail's source and OSM report back as they were.
 *
 * The map lifecycle is in use-geometry-editor-map.ts. This component owns
 * working geometry, form writes, and undo history. The live distance readout
 * writes directly to its DOM node to avoid rendering Payload on every drag.
 */
import type { EditorBasemap } from './editor-map';
import {
  LINESTRING,
  SELECT,
  paintHistoryPoint,
  useGeometryEditorMap,
  useGeometryEditorMapRefs,
  type GeometryEditorMode,
} from './use-geometry-editor-map';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The public app pulls this in from its own layout, but the (payload) route
// group is a separate tree — without it the map renders with broken controls.
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  toast,
  useConfig,
  useDocumentInfo,
  useFormBackgroundProcessing,
  useFormProcessing,
} from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import type { TerraDraw } from 'terra-draw';
import { mapConfig } from '@/config/map.config';
import type { TrailNetworkResponse } from '@/payload/endpoints/trail-network';
import { boundsOf, lengthMeters } from '@/payload/osm/assemble';
import {
  createEditHistory,
  MAX_EDIT_HISTORY,
} from '@/payload/osm/edit-history';
import type { PreviewTrailGeometryResponse } from '@/payload/endpoints/preview-trail-geometry';
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
import {
  GPX_SIMPLIFY_TOLERANCE_M,
  MAX_GPX_BYTES,
  parseGpx,
} from '@/payload/osm/gpx';
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
import { cellBounds as trailCellBounds } from '@/payload/osm/trail-network';
import { METERS_TO_MILES } from '@/payload/osm/units';
import { cellBounds as routeCellBounds } from '@/payload/routing/cells';
import {
  ModeButton,
  plural,
  RouteBar,
  SelectBar,
} from './geometry-editor-controls';
import { Banner, type Tone } from './admin-ui';
import { type LineAddition, type RouteStatus } from './route-tool';

type Parts = [number, number][][];
/**
 * Who a line belongs to, as the form records it. An undo step restores this
 * along with the points, because the points alone don't say whether saving
 * should keep them or rebuild from OSM.
 */
interface LineOwner {
  hasUnsavedPreview: boolean;
  rebuild: boolean;
  report: unknown;
  source: string;
}

interface LineSnapshot {
  point?: [number, number];
  owner: LineOwner;
  parts: Parts;
}

/** What `commit` leaves behind after any edit made in the editor. */
const EDITED_OWNER: LineOwner = {
  hasUnsavedPreview: false,
  rebuild: false,
  report: null,
  source: 'edited',
};

const IDLE_ROUTE: RouteStatus = {
  network: 'idle',
  networkMessage: null,
  note: null,
  waypoints: 0,
};

export interface GeometryEditorProps {
  hasPathSnappingToggle?: boolean;
  readOnly?: boolean;
  label: string;
  geometry: {
    value: TrailGeometry | string | null;
    setValue(value: TrailGeometry | null): void;
    errorMessage?: string;
  };
  name: { value: string; setValue(value: string): void };
  osm?: {
    ids: number[] | string;
    source: string;
    setIds(value: number[]): void;
    setSource(value: string): void;
    rebuild: boolean;
    report: unknown;
    setRebuild(value: boolean): void;
    setReport(value: unknown): void;
    displayName: string;
    onPreview(body: PreviewTrailGeometryResponse): void;
  };
}

/** One point editor for trail and route lines; adapters own their form fields. */
export function GeometryMapEditor({
  readOnly,
  label,
  geometry,
  name,
  osm,
  hasPathSnappingToggle = false,
}: GeometryEditorProps) {
  const {
    value: geomValue,
    setValue: setGeom,
    errorMessage: geomError,
  } = geometry;
  const showGeomError = Boolean(geomError);
  const { value: trailName, setValue: setTrailName } = name;
  const hasOsmSource = Boolean(osm);
  const osmIdsValue = osm?.ids;
  const geometrySource = osm?.source ?? 'edited';
  const setOsmIds = osm?.setIds ?? ignoreChange;
  const setGeometrySource = osm?.setSource ?? ignoreChange;
  const setRebuild = osm?.setRebuild ?? ignoreChange;
  const setOsmReport = osm?.setReport ?? ignoreChange;
  const rebuildValue = Boolean(osm?.rebuild);
  const osmReportValue = osm?.report ?? null;
  const displayName = osm?.displayName;
  const {
    config: {
      routes: { api: apiRoute },
      serverURL,
    },
  } = useConfig();
  const isProcessing = useFormProcessing();
  const isBackgroundProcessing = useFormBackgroundProcessing();
  const { data: documentData, id: documentId } = useDocumentInfo();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLSpanElement | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const mapHandles = useGeometryEditorMapRefs();
  const { drawRef, mapRef, routeToolRef, selectionToolRef, startedRef } =
    mapHandles;

  /** The working copy. Written at drag rate, so it cannot live in state. */
  const partsRef = useRef<Parts>([]);
  /**
   * The line as of the last settled edit — what an undo snapshot is taken from.
   * `partsRef` runs ahead of it during a drag or a piece being drawn.
   */
  const settledRef = useRef<Parts>([]);
  /** Who owned `settledRef`'s line — undo has to hand that back too. */
  const settledOwnerRef = useRef<LineOwner>(EDITED_OWNER);
  /** True while *we* are writing into Terra Draw's store. See the change handler. */
  const loadingRef = useRef(false);
  /** Undo and redo for every edit. See `edit-history.ts`. */
  const historyRef = useRef(createEditHistory(cloneSnapshot));
  const historyPointRef = useRef<LineSnapshot['point']>(undefined);
  const refreshRequestRef = useRef<AbortController | null>(null);
  const gpxImportRef = useRef(0);

  const [drawFailed, setDrawFailed] = useState(false);
  const [mode, setMode] = useState<GeometryEditorMode>(() =>
    osm
      ? 'pick'
      : parseTrailGeometry(geomValue).parts?.length
        ? 'move'
        : hasPathSnappingToggle
          ? 'route'
          : 'draw',
  );
  const [basemap, setBasemap] = useState<EditorBasemap>('streets');
  const [names, setNames] = useState<Record<number, string>>({});
  const [history, setHistory] = useState({ canRedo: false, canUndo: false });
  const [isRemovingPoint, setIsRemovingPoint] = useState(false);
  const [pointRemovalNote, setPointRemovalNote] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasUnsavedPreview, setHasUnsavedPreview] = useState(false);
  const [importNote, setImportNote] = useState<{
    text: string;
    tone: Tone;
  } | null>(null);
  const [isManualRoute, setIsManualRoute] = useState(false);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>(IDLE_ROUTE);
  const [selection, setSelection] = useState<PointRef[]>([]);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [toleranceMeters, setToleranceMeters] = useState(
    GPX_SIMPLIFY_TOLERANCE_M,
  );
  /**
   * The ways the line currently on screen was built from.
   *
   * Picking a way does not add it to the line — the line is assembled from
   * Overpass when you refresh the preview. So a way picked a moment ago has no
   * points on it, and in Move points that reads as "this way is broken" rather
   * than "this way isn't in the line yet". Comparing against this is how the
   * editor can say which it is.
   */
  const [lineWays, setLineWays] = useState<number[]>([]);

  const ids = useMemo<number[]>(() => {
    const parsed = parseOsmIds(osmIdsValue);
    return parsed.ok ? parsed.ids : [];
  }, [osmIdsValue]);

  // Imperative edits read current form values without subscribing at drag rate.
  const idsRef = useRef(ids);
  const modeRef = useRef(mode);
  const readOnlyRef = useRef(Boolean(readOnly));
  const sourceRef = useRef(geometrySource);
  const rebuildRef = useRef(rebuildValue);
  const osmReportRef = useRef(osmReportValue);
  const setGeomRef = useRef(setGeom);
  const setOsmIdsRef = useRef(setOsmIds);
  const setOsmReportRef = useRef(setOsmReport);
  const setRebuildRef = useRef(setRebuild);
  const setSourceRef = useRef(setGeometrySource);
  const apiRef = useRef({ apiRoute, serverURL });
  // RouteLineEditor remounts when the source changes.
  const usesRouteNetworkRef = useRef(hasPathSnappingToggle);
  apiRef.current = { apiRoute, serverURL };
  idsRef.current = ids;
  modeRef.current = mode;
  readOnlyRef.current = Boolean(readOnly);
  sourceRef.current = geometrySource;
  rebuildRef.current = rebuildValue;
  osmReportRef.current = osmReportValue;
  setGeomRef.current = setGeom;
  setOsmIdsRef.current = setOsmIds;
  setOsmReportRef.current = setOsmReport;
  setRebuildRef.current = setRebuild;
  setSourceRef.current = setGeometrySource;

  const editable = !readOnly;

  const cancelRefresh = useCallback(() => {
    const request = refreshRequestRef.current;
    if (!request) {
      return;
    }
    refreshRequestRef.current = null;
    request.abort();
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    refreshRequestRef.current?.abort();
    refreshRequestRef.current = null;
    setRefreshError(null);
    setIsRefreshing(false);
    setHasUnsavedPreview(false);

    return () => {
      gpxImportRef.current += 1;
      refreshRequestRef.current?.abort();
      refreshRequestRef.current = null;
    };
  }, [documentData?.updatedAt, documentId]);

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
   * Flipping the source is what makes the edit survive: an 'osm' trail restores
   * its last reviewed geometry unless a new OSM preview accompanies the save.
   * Undo passes the owner the restored line had instead, so taking back a GPX
   * import hands an OSM trail back to OSM rather than leaving it hand-edited.
   */
  const commit = useCallback(
    (owner: LineOwner = EDITED_OWNER) => {
      // A late OSM response must never overwrite a point edit made while the
      // network request was running.
      cancelRefresh();
      setHasUnsavedPreview(owner.hasUnsavedPreview);
      setOsmReportRef.current(owner.report);
      setRebuildRef.current(owner.rebuild);
      setGeomRef.current(toTrailGeometry(partsRef.current));
      if (sourceRef.current !== owner.source) {
        sourceRef.current = owner.source;
        setSourceRef.current(owner.source);
      }
    },
    [cancelRefresh],
  );

  const syncHistory = useCallback(() => {
    const draw = startedRef.current ? drawRef.current : null;
    const route = modeRef.current === 'route' ? routeToolRef.current : null;
    const isDrawing = modeRef.current === 'draw' && Boolean(draw?.canUndo());
    setHistory({
      canRedo:
        Boolean(route?.canRedoLeg()) ||
        (modeRef.current === 'draw' && Boolean(draw?.canRedo())) ||
        (!route?.hasRoute() && !isDrawing && historyRef.current.canRedo()),
      canUndo:
        Boolean(route?.hasRoute()) || isDrawing || historyRef.current.canUndo(),
    });
  }, [drawRef, routeToolRef, startedRef]);

  const setHistoryPoint = useCallback(
    (point?: LineSnapshot['point']) => {
      historyPointRef.current = point;
      paintHistoryPoint(mapRef.current, point);
    },
    [mapRef],
  );

  const recordEdit = useCallback(
    (base: Parts, next: Parts, addition?: LineAddition) => {
      const owner = settledOwnerRef.current;
      const history = historyRef.current;
      history.push({ owner, parts: base, point: historyPointRef.current });
      if (!addition) {
        return;
      }
      const { atStart, partIndex, pointCounts } = addition;
      const part = next[partIndex];
      // The last count is the current line. Older prefixes past the history
      // limit would be discarded as soon as we push the newer ones.
      for (const count of pointCounts.slice(-MAX_EDIT_HISTORY - 1, -1)) {
        if (count === 1) {
          // A single click is visible, but cannot be saved as a LineString.
          history.push({ owner, parts: base, point: part[0] });
        } else {
          const prefix = [...next];
          prefix[partIndex] = atStart
            ? part.slice(-count)
            : part.slice(0, count);
          history.push({ owner: EDITED_OWNER, parts: prefix });
        }
      }
    },
    [],
  );

  /** A drag can preview many updates before settling as one edit. */
  const settle = useCallback(
    (addition?: LineAddition) => {
      if (samePartsAs(settledRef.current, partsRef.current)) {
        return;
      }
      recordEdit(settledRef.current, partsRef.current, addition);
      setHistoryPoint();
      settledRef.current = cloneParts(partsRef.current);
      settledOwnerRef.current = EDITED_OWNER;
      syncHistory();
    },
    [recordEdit, setHistoryPoint, syncHistory],
  );

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
      // Rounded for the same reason the adapter is: partsRef must stay at the
      // precision the form-sync effect compares. An unfinished stroke includes
      // the live cursor, so it stays in Terra Draw until the user finishes it.
      const next = roundParts(
        featuresToParts(
          draw
            .getSnapshot()
            .filter((feature) => !feature.properties.currentlyDrawing),
        ),
      );
      const changed = !samePartsAs(next, partsRef.current);

      partsRef.current = next;
      paintStats();
      if (write && changed) {
        commit();
      }
    },
    [commit, paintStats, drawRef],
  );

  const togglePick = useCallback(
    (id: number, name: string) => {
      // The response is tied to the exact ordered id list sent to Overpass. If
      // that list changes, discard the request instead of pairing an old line
      // with the new selection.
      cancelRefresh();
      const current = idsRef.current;
      // Order is meaningful — it disambiguates trails that double back — so
      // append rather than sort.
      const next = current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id];
      setNames((previous) => ({ ...previous, [id]: name }));
      setHasUnsavedPreview(false);
      setRefreshError(null);
      setOsmReportRef.current(null);
      setRebuildRef.current(false);
      setOsmIdsRef.current(next);
      if (sourceRef.current === 'imported') {
        // Selecting a maintainable source is the curator's explicit request to
        // replace a style-only imported line. Without this, imported trails
        // would accept the clicks and then ignore them on save.
        sourceRef.current = 'osm';
        setSourceRef.current('osm');
      }
    },
    [cancelRefresh],
  );

  /**
   * Replaces Terra Draw's store with the given line.
   *
   * `baseline` says whether this line is a new starting point — a document
   * loading, or a save coming back — in which case there is nothing before it
   * left to undo. Undo, redo, the bulk edits, and a basemap switch pass false,
   * because the history is still every bit as valid as it was a moment ago.
   */
  const loadDraw = useCallback(
    (parts: Parts, baseline = true) => {
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
          }
          setDrawFailed(rejected.length > 0);
        } else {
          setDrawFailed(false);
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
        settledOwnerRef.current = {
          hasUnsavedPreview: false,
          rebuild: rebuildRef.current,
          report: osmReportRef.current,
          source: sourceRef.current,
        };
        setHistory({ canRedo: false, canUndo: false });
      }
    },
    [drawRef, startedRef],
  );

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
    // Selecting switches Terra Draw out of static mode, which would put drag
    // handles on a line whose edits are never written back.
    if (!draw || !startedRef.current || readOnlyRef.current) {
      return;
    }
    const lines = draw
      .getSnapshot()
      .filter((feature) => feature.geometry.type === 'LineString');
    if (lines.length === 1 && lines[0].id !== undefined) {
      draw.selectFeature(lines[0].id, SELECT);
    }
  }, [drawRef, startedRef]);

  /**
   * Puts a whole new line on screen and into the form, without touching the
   * history — the callers decide what that step means for undo.
   * Callers pass rounded coordinates so Terra Draw can load them.
   */
  const setLine = useCallback(
    (
      next: Parts,
      owner: LineOwner = EDITED_OWNER,
      point?: LineSnapshot['point'],
    ) => {
      partsRef.current = next;
      setHistoryPoint(point);
      settledRef.current = cloneParts(partsRef.current);
      settledOwnerRef.current = owner;
      loadDraw(partsRef.current, false);
      paintStats();
      commit(owner);
      selectionToolRef.current?.refresh();
      // A route in progress was built against the old line — it may be set to
      // extend a piece that no longer exists, or is now a different one.
      const route = routeToolRef.current;
      if (route?.hasRoute() || route?.canRedoLeg()) {
        route.cancel();
      }
      // Loading cleared Terra Draw's selection, which is what shows the handles.
      if (modeRef.current === 'move') {
        autoSelect();
      }
      syncHistory();
    },
    [
      autoSelect,
      commit,
      loadDraw,
      paintStats,
      setHistoryPoint,
      syncHistory,
      routeToolRef,
      selectionToolRef,
    ],
  );

  /**
   * Applies one bulk edit as one undo step.
   *
   * `before` is for a gesture that has been previewing as it went (a group
   * drag): by its end the working line already *is* the result, so the step
   * has to be recorded from where the gesture started.
   */
  const applyEdit = useCallback(
    (next: Parts, before?: Parts, addition?: LineAddition) => {
      if (!before) {
        // Any Terra Draw edit not yet closed off becomes its own step first.
        settle();
      }
      const base = before ?? settledRef.current;
      const rounded = roundParts(next);
      if (samePartsAs(rounded, base)) {
        if (before) {
          setLine(base);
        }
        return;
      }
      // A gesture previews without committing, so ownership is still as settled.
      recordEdit(base, rounded, addition);
      setLine(rounded);
    },
    [recordEdit, setLine, settle],
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
    [applyEdit, selectionToolRef],
  );

  const fetchNetwork = useCallback(async (cell: string) => {
    const { apiRoute: api, serverURL: server } = apiRef.current;
    const isRoute = usesRouteNetworkRef.current;
    if (isRoute && !routeCellBounds(cell)) {
      return [];
    }
    const endpoint = formatAdminURL({
      apiRoute: api,
      path: isRoute ? '/routes/network' : '/trails/network',
      serverURL: server,
    });
    const query = isRoute
      ? `cell=${cell}`
      : `bbox=${trailCellBounds(cell).join(',')}`;
    const response = await fetch(`${endpoint}?${query}`, {
      credentials: 'same-origin',
    });
    const body = (await response.json().catch(() => ({}))) as Partial<
      TrailNetworkResponse & { message: string }
    >;
    if (!response.ok || !Array.isArray(body.ways)) {
      throw new Error(
        body.message ??
          `The network could not be loaded (HTTP ${response.status}).`,
      );
    }
    return body.ways;
  }, []);

  const ready = useGeometryEditorMap({
    ...mapHandles,
    basemap,
    container: containerRef,
    onModeChange() {
      setEditNote(null);
      syncHistory();
    },
    onRouteDeactivate: () => setRouteStatus(IDLE_ROUTE),
    ids,
    mode,
    editable,
    isRemovingPoint,
    historyPoint: historyPointRef,
    networkKind: hasPathSnappingToggle ? 'route' : 'trail',
    getParts: () => partsRef.current,
    fetchNetwork,
    onRouteFinish: (next, addition) => applyEdit(next, undefined, addition),
    onRouteStatus(status) {
      setRouteStatus(status);
      syncHistory();
    },
    onPointEdit: applyEdit,
    onPointSelection: setSelection,
    onPointPreview: previewLine,
    onPick: togglePick,
    onPointRemoval(result) {
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
    },
    onDrawStart() {
      loadDraw(partsRef.current, false);
      if (mode === 'move') autoSelect();
    },
    onDrawError: () => setDrawFailed(true),
    onDrawChange(_ids, type) {
      if (type === 'styling') return;
      // Terra Draw emits changes for our own writes as well as rider edits.
      readBack(!loadingRef.current && editable);
      if (
        type === 'delete' &&
        !loadingRef.current &&
        editable &&
        mode === 'move'
      ) {
        // Delete removes a piece without a finish event.
        const draw = drawRef.current;
        queueMicrotask(() => {
          if (
            draw &&
            drawRef.current === draw &&
            startedRef.current &&
            !readOnlyRef.current
          )
            settle();
        });
      }
    },
    onDrawFinish(id, { mode: drawMode, action }) {
      if (!editable) return;
      if (drawMode === LINESTRING && action === 'draw') {
        const lines = drawRef.current
          ?.getSnapshot()
          .filter((feature) => feature.geometry.type === 'LineString');
        const partIndex =
          lines?.findIndex((feature) => feature.id === id) ?? -1;
        const part = partsRef.current[partIndex];
        if (part) {
          settle({ partIndex, pointCounts: part.map((_, index) => index + 1) });
          return;
        }
      }
      settle();
    },
    onDrawHistory: syncHistory,
  });

  useEffect(() => {
    if (ready && startedRef.current && mode === 'move' && editable)
      autoSelect();
  }, [autoSelect, editable, mode, ready, startedRef]);

  useEffect(() => {
    if (mode !== 'move' || !editable) {
      setIsRemovingPoint(false);
      setPointRemovalNote(null);
    }
  }, [editable, mode]);

  /**
   * Shows a line that came from outside the editor — a document load, a save
   * coming back, or an OSM preview — and frames it. Writes nothing to the form.
   */
  const receiveLine = useCallback(
    (incoming: Parts, baseline: boolean) => {
      partsRef.current = incoming;
      setHistoryPoint();
      loadDraw(incoming, baseline);
      settledRef.current = cloneParts(incoming);
      paintStats();
      // Same as `setLine`: a selection or a route in progress names points and
      // pieces of the line just replaced — a refresh from OSM can land mid-edit.
      selectionToolRef.current?.setSelection([]);
      setEditNote(null);
      const route = routeToolRef.current;
      if (route?.hasRoute() || route?.canRedoLeg()) {
        route.cancel();
      }
      if (modeRef.current === 'move') {
        autoSelect();
      }

      const map = mapRef.current;
      const bounds = boundsOf(incoming);
      if (map && bounds) {
        map.fitBounds(bounds, { animate: false, padding: 60 });
      }
    },
    [
      autoSelect,
      loadDraw,
      paintStats,
      setHistoryPoint,
      mapRef,
      routeToolRef,
      selectionToolRef,
    ],
  );

  // Pull the stored line in — on first load, and after a save replaces it with
  // the server's rebuilt version.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) {
      return;
    }
    // Compare and track the same precision as Terra Draw's editable copy.
    // Keep the stored form value intact until the curator makes an edit.
    const incoming = roundParts(parseTrailGeometry(geomValue).parts ?? []);
    if (samePartsAs(incoming, partsRef.current)) {
      return;
    }

    receiveLine(incoming, true);
    // Whatever ways are on the record right now are the ones this line came
    // from — the server rebuilt it from them on the save that produced it.
    setLineWays(idsRef.current);
  }, [geomValue, ready, receiveLine, drawRef]);

  /** The line now, for the history to keep as the step redo or undo returns to. */
  const currentSnapshot = useCallback(
    (): LineSnapshot => ({
      // Anything past the settled line went through `commit`.
      owner: samePartsAs(settledRef.current, partsRef.current)
        ? settledOwnerRef.current
        : EDITED_OWNER,
      parts: partsRef.current,
      point: historyPointRef.current,
    }),
    [],
  );

  /**
   * Undo, taking back the smallest thing first: a click of the route being
   * built, then a point of the piece being drawn, then the last settled edit.
   */
  const undo = useCallback(() => {
    const draw = drawRef.current;
    if (modeRef.current === 'route' && routeToolRef.current?.undoLeg()) {
      return;
    }
    if (modeRef.current === 'draw' && draw?.canUndo()) {
      draw.undo();
      syncHistory();
      return;
    }
    settle();
    const previous = historyRef.current.undo(currentSnapshot());
    if (previous) {
      setLine(previous.parts, previous.owner, previous.point);
      selectionToolRef.current?.clear();
      setEditNote(null);
    }
  }, [
    currentSnapshot,
    setLine,
    settle,
    syncHistory,
    drawRef,
    routeToolRef,
    selectionToolRef,
  ]);

  const redo = useCallback(() => {
    if (modeRef.current === 'route') {
      const route = routeToolRef.current;
      if (route?.redoLeg() || route?.hasRoute()) {
        return;
      }
    }
    const draw = drawRef.current;
    if (modeRef.current === 'draw') {
      if (draw?.canRedo()) {
        draw.redo();
        syncHistory();
        return;
      }
      if (draw?.canUndo()) {
        return;
      }
    }
    const next = historyRef.current.redo(currentSnapshot());
    if (next) {
      setLine(next.parts, next.owner, next.point);
      selectionToolRef.current?.clear();
      setEditNote(null);
    }
  }, [
    currentSnapshot,
    setLine,
    syncHistory,
    drawRef,
    routeToolRef,
    selectionToolRef,
  ]);

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
  }, [runEdit, selectionToolRef]);

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
  }, [runEdit, selectionToolRef]);

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
  }, [runEdit, selectionToolRef]);

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
  }, [runEdit, selectionToolRef]);

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
  }, [runEdit, toleranceMeters, selectionToolRef]);

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
    [deleteSelected, redo, undo, routeToolRef, selectionToolRef],
  );

  async function refreshFromOsm(): Promise<void> {
    if (
      !editable ||
      ids.length === 0 ||
      isRefreshing ||
      refreshRequestRef.current !== null ||
      isProcessing ||
      isBackgroundProcessing
    ) {
      return;
    }

    setRefreshError(null);
    setIsRefreshing(true);
    const controller = new AbortController();
    const requestedIds = [...ids];
    refreshRequestRef.current = controller;

    try {
      const endpoint = formatAdminURL({
        apiRoute,
        path: '/trails/preview-osm-geometry',
        serverURL,
      });
      const response = await fetch(endpoint, {
        body: JSON.stringify({ name: displayName || trailName, osmIds: ids }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (controller.signal.aborted) {
        return;
      }
      if (!sameOrderedIds(requestedIds, idsRef.current)) {
        return;
      }
      if (!response.ok || !isGeometryPreview(body)) {
        throw new Error(messageFrom(body));
      }

      const report = {
        ...body.report,
        builtAt: new Date().toISOString(),
        isPreview: true,
        requestedIds,
        source: 'osm',
      };
      // One undo step, not a new document: a refresh to compare against OSM
      // must not cost the unsaved hand edits it replaced. Shown here rather
      // than by the form-sync effect, which would treat it as a load.
      settle();
      historyRef.current.push(currentSnapshot());
      receiveLine(
        roundParts(parseTrailGeometry(body.geometry).parts ?? []),
        false,
      );
      settledOwnerRef.current = {
        hasUnsavedPreview: true,
        rebuild: true,
        report,
        source: 'osm',
      };
      sourceRef.current = 'osm';
      syncHistory();

      setGeom(body.geometry);
      setGeometrySource('osm');
      osm?.onPreview(body);
      setOsmReport(report);
      setRebuild(true);
      // The builder may reorder connected ways while joining them. The preview
      // still corresponds to the ordered selection we sent, so track that
      // request rather than comparing the form against the assembled order.
      setLineWays(requestedIds);
      setHasUnsavedPreview(true);
      toast.success(body.message);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'The trail line could not be refreshed.';
      setRefreshError(message);
      toast.error(message);
    } finally {
      if (refreshRequestRef.current === controller) {
        refreshRequestRef.current = null;
        setIsRefreshing(false);
      }
    }
  }
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
      const importId = ++gpxImportRef.current;
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
        if (importId !== gpxImportRef.current) return;
        setImportNote({
          text: `${file.name} could not be read.`,
          tone: 'error',
        });
        return;
      }
      if (importId !== gpxImportRef.current || readOnlyRef.current) return;
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
        text: `Imported ${file.name}: ${parsed.pointsRead.toLocaleString()} GPS points simplified to ${kept.toLocaleString()}${pieces}. ${hadLine ? 'Undo brings back the previous line. ' : ''}Adjust the line if needed, then save to measure its distance${hasOsmSource ? ' and elevation' : ''}.`,
        tone: 'info',
      });
    },
    [applyEdit, setTrailName, trailName, hasOsmSource, mapRef],
  );

  // --- render ------------------------------------------------------------

  if (!mapConfig.mapbox.accessToken) {
    return (
      <div className="field-type">
        <p>
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to use the geometry editor.
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
  const canRefresh =
    editable &&
    picked.length > 0 &&
    !isRefreshing &&
    !isProcessing &&
    !isBackgroundProcessing;

  return (
    <div className="field-type">
      <div className="field-label">{label}</div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          aria-label={`${label} editing mode`}
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          {osm && (
            <ModeButton
              active={mode === 'pick'}
              disabled={!editable}
              label="Choose from OpenStreetMap"
              onClick={() => setMode('pick')}
            />
          )}
          {hasPathSnappingToggle ? (
            <>
              <ModeButton
                active={mode === 'route'}
                disabled={!editable || drawFailed}
                label="Path snapping"
                onClick={() => setMode('route')}
              />
              <ModeButton
                active={mode !== 'route'}
                disabled={!editable || drawFailed}
                label="Point editing"
                onClick={() => {
                  // Settle the snapped line before choosing the point tool so
                  // an in-progress route opens with its vertex handles ready.
                  routeToolRef.current?.finish();
                  setMode(partsRef.current.length > 0 ? 'move' : 'draw');
                }}
              />
            </>
          ) : (
            <ModeButton
              active={mode === 'route'}
              disabled={!editable || drawFailed}
              label="Follow trails"
              onClick={() => setMode('route')}
            />
          )}
          {(!hasPathSnappingToggle || mode !== 'route') && (
            <>
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
            </>
          )}
        </div>
        <div
          aria-label={`${label} tools`}
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

      {showGeomError && geomError && <Banner tone="error">{geomError}</Banner>}

      {importNote && <Banner tone={importNote.tone}>{importNote.text}</Banner>}

      {staleNote && <Banner tone="warning">{staleNote}</Banner>}

      {hasUnsavedPreview && (
        <Banner>
          This refreshed line is only a preview. Review it here, then use Save
          draft or Publish to keep it.
        </Banner>
      )}

      {refreshError && <Banner tone="error">{refreshError}</Banner>}

      {drawFailed && (
        <Banner tone="error">
          The line editor could not attach to the map, so this line is read-only
          here. Other fields can still be saved.
        </Banner>
      )}

      {mode === 'route' && editable && (
        <RouteBar
          onCancel={() => routeToolRef.current?.cancel()}
          onFinish={() => routeToolRef.current?.finish()}
          onToggleManual={
            hasPathSnappingToggle
              ? () => {
                  routeToolRef.current?.setManualPoints(!isManualRoute);
                  setIsManualRoute(!isManualRoute);
                }
              : undefined
          }
          isManual={isManualRoute}
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
        aria-label={`${label} map`}
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
      </div>

      <p className="mb-2 mt-0 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.45]">
        {hintFor(
          mode,
          geometrySource,
          hasLine,
          ids.length > 0,
          parts.length,
          isRemovingPoint,
          hasOsmSource,
          hasPathSnappingToggle,
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
            <>
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
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <ModeButton
                  active={false}
                  disabled={!canRefresh}
                  isToggle={false}
                  label={
                    isRefreshing
                      ? 'Refreshing line…'
                      : 'Refresh line from OpenStreetMap'
                  }
                  onClick={() => void refreshFromOsm()}
                />
                <span className="max-w-[60ch] text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.4]">
                  Loads the latest selected segments into this form without
                  saving them.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
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
  mode: GeometryEditorMode,
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
    return 'The selected OpenStreetMap trails have changed, but this custom line is still on the map. Refresh the line below to preview the selected segments before saving them.';
  }

  if (mode === 'pick') {
    return null;
  }

  return hasLine
    ? 'The selected OpenStreetMap trails have changed since this line was built. Refresh the line below to preview the new sections before saving or adjusting them.'
    : null;
}

function sameOrderedIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function hintFor(
  mode: GeometryEditorMode,
  source: string,
  hasLine: boolean,
  hasWays: boolean,
  pieces: number,
  isRemovingPoint: boolean,
  hasOsmSource: boolean,
  hasPathSnappingToggle: boolean,
): string {
  if (mode === 'pick') {
    if (source === 'edited') {
      return 'Click trail segments to select them. Your custom line stays unchanged until you refresh the line, so you can review the replacement before saving.';
    }
    if (source === 'imported') {
      return 'Click a trail segment to start replacing the imported map line with OpenStreetMap. Select segments in riding order, then refresh the line to review it.';
    }
    return 'Click a trail segment to select it; click it again to remove it. For trails that double back, select segments in riding order. Refresh joins those segments into a line you can review before saving.';
  }

  const takesOwnership =
    source === 'edited'
      ? ''
      : ' Your first change makes this a custom line, so future saves keep your version instead of replacing it from OpenStreetMap.';

  if (mode === 'route') {
    const network = hasPathSnappingToggle
      ? 'roads, sidewalks, and trails'
      : 'trails';
    const manualHint = hasPathSnappingToggle
      ? ' Toggle Manual points to click through gaps, then turn it off to resume snapping.'
      : '';
    return `Click where the line starts, then click farther along. The line follows mapped ${network} between clicks.${manualHint} Start on the end of an existing piece to extend it. Hold Alt (Option) while clicking to go straight across a gap. Double-click or press Enter to finish, Backspace to take back a click, Escape to cancel.${takesOwnership}`;
  }

  if (mode === 'draw') {
    return `Click to add points to the line; it snaps to the line’s own points. To trace a trail that is on the map, Follow trails is faster. Press Enter to finish a piece, Escape to cancel it.${takesOwnership}`;
  }

  // The most confusing state in the editor: ways are picked but the line does
  // not exist yet, because it is assembled from Overpass when you refresh the
  // preview. Without saying so, Move points just looks broken.
  if (!hasLine) {
    return hasWays
      ? 'Nothing to adjust yet. Return to Choose from OpenStreetMap and refresh the line first.'
      : 'Nothing to adjust yet. Import a GPX file, or use Follow trails or Draw line to click along the route.';
  }

  if (mode === 'select') {
    return `Click a point to select it; Shift- or Ctrl-click to add or remove points; Shift-drag a box to select every point in it. Drag a selected point to move the whole selection. Press Delete to remove the selected points, Escape to clear. With nothing selected, Join, Reverse, and Simplify act on the whole line.${takesOwnership}`;
  }
  // With one piece the editor selects it for you; with several it can't know
  // which one you mean, so say that rather than leaving you to guess why the
  // handles aren't there.
  const selecting =
    pieces > 1
      ? `This line is in ${pieces} pieces — click one to select it, then `
      : '';

  if (isRemovingPoint) {
    return `${selecting}click a visible point to remove it. Choose Remove point again when you are done. Each removal can be undone.${takesOwnership}`;
  }

  // The two deletions are wildly different in blast radius and only one pixel
  // apart on screen, so they are spelled out separately. An earlier version of
  // this sentence said "click a point and press Delete to remove it", which is
  // the gesture that removes the *whole piece* — following it lost a section of
  // trail, and Terra Draw cannot undo that on its own.
  return `${selecting}drag a point to move it, drag a midpoint to add one, or choose Remove point and click a point. You can also right-click a point to remove it. Press Delete to remove the whole selected piece; Undo brings it back. Distance updates as you drag. ${hasOsmSource ? 'Calculate elevation below when the line is ready.' : 'Save to update distance and bounds.'}${takesOwnership}`;
}

function isGeometryPreview(
  value: unknown,
): value is PreviewTrailGeometryResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PreviewTrailGeometryResponse>;
  const measurements = candidate.measurements;
  const report = candidate.report;
  const parsed = parseTrailGeometry(candidate.geometry);
  return Boolean(
    typeof candidate.message === 'string' &&
      parsed.ok &&
      parsed.parts.length > 0 &&
      measurements &&
      isBounds(measurements.bounds) &&
      isFiniteNumber(measurements.distance) &&
      isOptionalNumber(measurements.elevationGain) &&
      isOptionalNumber(measurements.elevationLoss) &&
      isOptionalNumber(measurements.elevationMax) &&
      isOptionalNumber(measurements.elevationMin) &&
      report &&
      Array.isArray(report.gaps) &&
      Array.isArray(report.missingIds) &&
      Array.isArray(report.resolvedIds) &&
      Array.isArray(report.warnings),
  );
}

function isBounds(
  value: unknown,
): value is [number, number, number, number] | null {
  return (
    value === null ||
    (Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isAbortError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function messageFrom(value: unknown): string {
  if (value && typeof value === 'object' && 'message' in value) {
    const message = value.message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'The trail line could not be refreshed.';
}

function ignoreChange() {}

function cloneSnapshot(snapshot: LineSnapshot): LineSnapshot {
  // The owner is replaced whole, never mutated, so it can be shared.
  return { ...snapshot, parts: cloneParts(snapshot.parts) };
}
