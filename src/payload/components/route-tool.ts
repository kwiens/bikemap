/**
 * Follow trails: click along a trail and the line follows the OSM network
 * between clicks, gpx.studio-style.
 *
 * Framework-free on purpose. It lives inside the trail editor's Payload form,
 * where a React re-render costs the whole document form, so everything that
 * happens at pointer rate — the snapped cursor, the preview leg — is written
 * straight to Mapbox sources. React hears about it only through `onStatus`, at
 * click and fetch rate.
 *
 * The trail and route editors load their respective OSM networks one fixed
 * grid cell at a time so panning never bursts the public Overpass instance.
 */
import type mapboxgl from 'mapbox-gl';
import {
  addWays,
  cellsCovering as trailCellsCovering,
  createTrailNetwork,
  MIN_NETWORK_ZOOM as MIN_TRAIL_ZOOM,
  type NetworkSnap,
  type NetworkWay,
  routeBetween,
  snapToNetwork,
} from '@/payload/osm/trail-network';
import {
  cellsCovering as routeCellsCovering,
  MIN_VIEW_LOAD_ZOOM,
} from '@/payload/routing/cells';

type Position = [number, number];
type Parts = Position[][];

export type NetworkState = 'error' | 'idle' | 'loading' | 'ready' | 'zoom';

export interface RouteStatus {
  /** A note about the last click, such as a straight-line fallback. */
  note: string | null;
  network: NetworkState;
  networkMessage: string | null;
  /** Clicks in the route being built; zero when none is in progress. */
  waypoints: number;
}

export interface LineAddition {
  atStart?: boolean;
  partIndex: number;
  /** Length of the edited part after each click that adds to it. */
  pointCounts: number[];
}

export interface RouteToolHost {
  apply(next: Parts, addition: LineAddition): void;
  fetchNetwork(cell: string): Promise<NetworkWay[]>;
  networkKind?: 'route' | 'trail';
  getParts(): Parts;
  isActive(): boolean;
  onStatus(status: RouteStatus): void;
}

export interface RouteTool {
  /** Starts loading the network for the view. Call on entering the mode. */
  activate(): void;
  canRedoLeg(): boolean;
  /** Throws away the route being built. */
  cancel(): void;
  /** Keeps whatever route is in progress and clears the preview. Call on leaving the mode. */
  deactivate(): void;
  /**
   * Stops for good: no more listeners, timers, frames, or fetches. Call before
   * `map.remove()`, or a failed cell keeps retrying for a map that is gone.
   */
  dispose(): void;
  /** Commits the route being built, if it has a leg. */
  finish(): void;
  hasRoute(): boolean;
  /** (Re)adds the tool's layers. Call after every `style.load`. */
  install(): void;
  /** Restores the last click that was undone. */
  redoLeg(): boolean;
  setManualPoints(isManual: boolean): void;
  /** Takes back the last click. Returns false when there was nothing to take back. */
  undoLeg(): boolean;
}

interface Waypoint {
  /**
   * An Alt click: the leg arriving here goes straight to the raw click. The leg
   * leaving it still follows the trails, from `snap`.
   */
  isFree: boolean;
  /** Where the route starts or ends at this click — `snap.point` unless free. */
  position: Position;
  /** The network point nearest the click; null when there is none in range. */
  snap: NetworkSnap | null;
}

interface RouteClick {
  waypoint: Waypoint;
  coordinates: Position[];
  note: string | null;
}

const PATH_SOURCE = 'route-tool-path';
const PREVIEW_SOURCE = 'route-tool-preview';
const POINTS_SOURCE = 'route-tool-points';
const ROUTE_COLOR = '#EA580C';

/** How close, in pixels, a click must land to snap to a trail or a line end. */
const SNAP_PIXELS = 30;

/** Clicks closer than this to the last one are the second half of a double-click. */
const DOUBLE_CLICK_PIXELS = 4;

/** Lets a snapped leg rejoin the network from the end of a manual segment. */
const MANUAL_APPROACH_METERS = 250;

/**
 * How long a cell that failed to load waits before it is asked for again —
 * long enough that a struggling Overpass isn't hammered, short enough that a
 * blip clears on its own.
 */
const RETRY_AFTER_MS = 30_000;

const EMPTY: GeoJSON.FeatureCollection = {
  features: [],
  type: 'FeatureCollection',
};

export function createRouteTool(
  map: mapboxgl.Map,
  host: RouteToolHost,
): RouteTool {
  const isRouteNetwork = host.networkKind === 'route';
  const minZoom = isRouteNetwork ? MIN_VIEW_LOAD_ZOOM : MIN_TRAIL_ZOOM;
  const cellsCovering = isRouteNetwork
    ? routeCellsCovering
    : trailCellsCovering;
  const networkLabel = isRouteNetwork ? 'paths and roads' : 'trails';
  const network = createTrailNetwork();
  const loaded = new Set<string>();
  /** Cells that failed to load, and when — see `RETRY_AFTER_MS`. */
  const failed = new Map<string, number>();
  let queue: string[] = [];
  let isFetching = false;

  const clicks: RouteClick[] = [];
  const undoneClicks: RouteClick[] = [];
  /** Set when the route started on the end of an existing piece. */
  let extend: { atStart: boolean; part: number } | null = null;

  let status: RouteStatus = {
    network: 'idle',
    networkMessage: null,
    note: null,
    waypoints: 0,
  };
  let frame = 0;
  let cursor: mapboxgl.LngLat | null = null;
  let isAltDown = false;
  let isManual = false;
  let lastClick: mapboxgl.Point | null = null;
  /** What the preview last drew, so an unmoved target skips the route search. */
  let previewKey = '';
  let retryTimers: ReturnType<typeof setTimeout>[] = [];
  let isDisposed = false;

  function report(patch: Partial<RouteStatus>) {
    status = { ...status, ...patch, waypoints: clicks.length };
    host.onStatus(status);
  }

  // --- the network ------------------------------------------------------

  function loadView() {
    if (isDisposed || !host.isActive()) {
      return;
    }
    if (map.getZoom() < minZoom) {
      report({
        network: 'zoom',
        networkMessage: `Zoom in to load ${networkLabel} to follow.`,
      });
      return;
    }
    const bounds = map.getBounds();
    if (!bounds) {
      return;
    }
    const now = Date.now();
    const missing = cellsCovering([
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]).filter((key) => !loaded.has(key));
    const cooling = missing.filter(
      (key) => now - (failed.get(key) ?? -Infinity) < RETRY_AFTER_MS,
    );
    const wanted = missing.filter((key) => !cooling.includes(key));
    // Only fetch cells in the current view. Keeping cells from every previous
    // view would queue Overpass work long after the editor panned away.
    queue = wanted;
    if (queue.length === 0 && !isFetching) {
      report(
        cooling.length > 0
          ? {
              network: 'error',
              networkMessage: `Some ${networkLabel} could not be loaded. Retrying shortly…`,
            }
          : { network: 'ready', networkMessage: null },
      );
    }
    if (queue.length > 0) {
      void drain();
    }
  }

  async function drain() {
    if (isFetching) {
      return;
    }
    isFetching = true;
    try {
      // Bounded by the cells in the latest view: each is shifted off once,
      // and a failure waits out `RETRY_AFTER_MS` before re-queueing.
      while (queue.length > 0) {
        const key = queue.shift() as string;
        if (loaded.has(key)) {
          continue;
        }
        report({
          network: 'loading',
          networkMessage: `Loading ${networkLabel}…`,
        });
        try {
          const ways = await host.fetchNetwork(key);
          if (isDisposed) {
            return;
          }
          addWays(network, ways);
          loaded.add(key);
          failed.delete(key);
        } catch (error) {
          if (isDisposed) {
            return;
          }
          failed.set(key, Date.now());
          const timer = setTimeout(() => {
            retryTimers = retryTimers.filter((pending) => pending !== timer);
            loadView();
          }, RETRY_AFTER_MS);
          retryTimers.push(timer);
          report({
            network: 'error',
            networkMessage:
              error instanceof Error
                ? error.message
                : `Could not load ${networkLabel}.`,
          });
        }
      }
    } finally {
      isFetching = false;
    }
    // A successful request must not hide an earlier failure in the same view.
    // Recheck the current bounds in case the editor panned during the fetch.
    loadView();
  }

  // --- building a route ---------------------------------------------------

  function snapMeters(at: mapboxgl.LngLat): number {
    const metersPerPixel =
      (40_075_016.686 * Math.cos((at.lat * Math.PI) / 180)) /
      (512 * 2 ** map.getZoom());
    return SNAP_PIXELS * metersPerPixel;
  }

  /** The end of an existing piece near the click, which a new route extends. */
  function nearbyEnd(at: mapboxgl.LngLat) {
    const click = map.project(at);
    let best: { atStart: boolean; part: number; pixels: number } | null = null;
    host.getParts().forEach((part, index) => {
      for (const atStart of [true, false]) {
        const end = atStart ? part[0] : part[part.length - 1];
        const pixels = click.dist(map.project(end));
        if (pixels <= SNAP_PIXELS && (!best || pixels < best.pixels)) {
          best = { atStart, part: index, pixels };
        }
      }
    });
    return best as { atStart: boolean; part: number; pixels: number } | null;
  }

  function waypointAt(at: mapboxgl.LngLat, isFree: boolean): Waypoint {
    const click: Position = [at.lng, at.lat];
    const snap = snapToNetwork(network, click, snapMeters(at));
    return {
      isFree,
      position: isFree ? click : (snap?.point ?? click),
      snap,
    };
  }

  /**
   * The leg from one waypoint to the next, and whether it fell back to a
   * straight line the curator did not ask for — the cue for the bar's note.
   */
  function legBetween(from: Waypoint, to: Waypoint) {
    if (to.isFree) {
      return { coordinates: [from.position, to.position], isStraight: false };
    }
    const fromSnap =
      from.snap ??
      (isRouteNetwork && from.isFree
        ? snapToNetwork(network, from.position, MANUAL_APPROACH_METERS)
        : null);
    const routed =
      fromSnap && to.snap ? routeBetween(network, fromSnap, to.snap) : null;
    if (!routed) {
      return { coordinates: [from.position, to.position], isStraight: true };
    }
    // A route starting off the network — a line end, or a free click — begins
    // there, then joins the trail.
    const start = same(routed[0], from.position) ? [] : [from.position];
    return { coordinates: [...start, ...routed], isStraight: false };
  }

  function onClick(event: mapboxgl.MapMouseEvent) {
    if (!host.isActive()) {
      return;
    }
    const isFree = isManual || event.originalEvent.altKey;
    // The second click of a double-click lands where the first did; it finishes
    // the route (see `onDoubleClick`) and must not add a leg of its own. Judged
    // by the pointer, not the snapped position, which can differ by a hair.
    const isRepeat =
      event.originalEvent.detail === 2 &&
      lastClick !== null &&
      event.point.dist(lastClick) < DOUBLE_CLICK_PIXELS;
    lastClick = event.point;

    const previous = clicks.at(-1)?.waypoint;
    let next = waypointAt(event.lngLat, isFree);

    if (!previous) {
      const end = isFree ? null : nearbyEnd(event.lngLat);
      extend = end ? { atStart: end.atStart, part: end.part } : null;
      if (end) {
        const part = host.getParts()[end.part];
        const position = end.atStart ? part[0] : part[part.length - 1];
        const snap = snapToNetwork(network, position, snapMeters(event.lngLat));
        next = { isFree: false, position, snap };
      }
      clicks.push({ waypoint: next, coordinates: [next.position], note: null });
    } else {
      if (isRepeat || same(next.position, previous.position)) {
        return;
      }
      const leg = legBetween(previous, next);
      clicks.push({
        waypoint: next,
        coordinates: leg.coordinates.slice(1),
        note: leg.isStraight
          ? `No connection through the loaded ${networkLabel}, so the points are joined with a straight line. Undo takes it back.`
          : null,
      });
    }
    undoneClicks.length = 0;
    updateRoute();
  }

  function onDoubleClick(event: mapboxgl.MapMouseEvent) {
    if (!host.isActive()) {
      return;
    }
    event.preventDefault();
    finish();
  }

  function onMove(event: mapboxgl.MapMouseEvent) {
    if (!host.isActive()) {
      return;
    }
    cursor = event.lngLat;
    isAltDown = event.originalEvent.altKey;
    if (!frame) {
      frame = requestAnimationFrame(renderPreview);
    }
  }

  function renderPreview() {
    frame = 0;
    if (!cursor || !host.isActive()) {
      return;
    }
    const target = waypointAt(cursor, isManual || isAltDown);
    const key = `${clicks.length}:${target.isFree}:${target.position.join(',')}`;
    if (key === previewKey) {
      return;
    }
    previewKey = key;
    const features: GeoJSON.Feature[] = [point(target.position, 'cursor')];
    const previous = clicks.at(-1)?.waypoint;
    if (previous && !same(previous.position, target.position)) {
      features.push(line(legBetween(previous, target).coordinates));
    }
    setData(PREVIEW_SOURCE, { features, type: 'FeatureCollection' });
  }

  function render() {
    const path = clicks.flatMap((click) => click.coordinates);
    setData(
      PATH_SOURCE,
      path.length > 1
        ? { features: [line(path)], type: 'FeatureCollection' }
        : EMPTY,
    );
    setData(POINTS_SOURCE, {
      features: clicks.map(({ waypoint }) =>
        point(waypoint.position, 'waypoint'),
      ),
      type: 'FeatureCollection',
    });
    // The waypoints changed (or the style was rebuilt), so the preview must be
    // drawn afresh even if the pointer hasn't moved.
    previewKey = '';
    if (frame === 0) {
      frame = requestAnimationFrame(renderPreview);
    }
  }

  function updateRoute() {
    render();
    report({ note: clicks.at(-1)?.note ?? null });
  }

  function reset() {
    clicks.length = 0;
    undoneClicks.length = 0;
    extend = null;
    lastClick = null;
    setData(PREVIEW_SOURCE, EMPTY);
    updateRoute();
  }

  function finish() {
    if (clicks.length < 2) {
      reset();
      return;
    }
    const path = clicks.flatMap((click) => click.coordinates);
    const parts = [...host.getParts()];
    const target = extend ? parts[extend.part] : undefined;
    const partIndex = extend && target ? extend.part : parts.length;
    const atStart = Boolean(extend?.atStart && target);
    let points = target ? target.length - 1 : 0;
    const pointCounts = clicks.map(({ coordinates }) => {
      points += coordinates.length;
      return points;
    });

    if (target) {
      // The first click anchors the extension at a point already on the line.
      pointCounts.shift();
      parts[partIndex] = atStart
        ? [...path.slice(1).reverse(), ...target]
        : [...target, ...path.slice(1)];
    } else {
      parts.push(path);
    }
    reset();
    host.apply(parts, { atStart, partIndex, pointCounts });
  }

  // --- wiring -------------------------------------------------------------

  map.on('click', onClick);
  map.on('dblclick', onDoubleClick);
  map.on('mousemove', onMove);
  map.on('moveend', loadView);

  function dispose() {
    isDisposed = true;
    queue = [];
    for (const timer of retryTimers) {
      clearTimeout(timer);
    }
    retryTimers = [];
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    map.off('click', onClick);
    map.off('dblclick', onDoubleClick);
    map.off('mousemove', onMove);
    map.off('moveend', loadView);
  }

  return {
    activate() {
      failed.clear();
      map.getCanvas().style.cursor = 'crosshair';
      loadView();
    },
    canRedoLeg: () => undoneClicks.length > 0,
    cancel: reset,
    deactivate() {
      // Switching modes mid-route keeps the work rather than discarding it.
      finish();
      cursor = null;
      previewKey = '';
      setData(PREVIEW_SOURCE, EMPTY);
    },
    dispose,
    finish,
    hasRoute: () => clicks.length > 0,
    install() {
      for (const id of [PATH_SOURCE, PREVIEW_SOURCE, POINTS_SOURCE]) {
        if (!map.getSource(id)) {
          map.addSource(id, { data: EMPTY, type: 'geojson' });
        }
      }
      map.addLayer({
        id: PATH_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_COLOR, 'line-width': 4 },
        source: PATH_SOURCE,
        type: 'line',
      });
      map.addLayer({
        filter: ['==', ['geometry-type'], 'LineString'],
        id: PREVIEW_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-dasharray': [1.5, 1.5],
          'line-opacity': 0.8,
          'line-width': 3,
        },
        source: PREVIEW_SOURCE,
        type: 'line',
      });
      map.addLayer({
        filter: ['==', ['geometry-type'], 'Point'],
        id: `${PREVIEW_SOURCE}-cursor`,
        paint: {
          'circle-color': '#fff',
          'circle-radius': 4,
          'circle-stroke-color': ROUTE_COLOR,
          'circle-stroke-width': 2,
        },
        source: PREVIEW_SOURCE,
        type: 'circle',
      });
      map.addLayer({
        id: POINTS_SOURCE,
        paint: {
          'circle-color': ROUTE_COLOR,
          'circle-radius': 5,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
        source: POINTS_SOURCE,
        type: 'circle',
      });
      render();
    },
    redoLeg() {
      const click = undoneClicks.pop();
      if (!click) {
        return false;
      }
      clicks.push(click);
      updateRoute();
      return true;
    },
    setManualPoints(value) {
      isManual = value;
      previewKey = '';
      if (!frame) frame = requestAnimationFrame(renderPreview);
    },
    undoLeg() {
      const click = clicks.pop();
      if (!click) {
        return false;
      }
      undoneClicks.push(click);
      lastClick = null;
      updateRoute();
      return true;
    },
  };

  function setData(id: string, data: GeoJSON.FeatureCollection) {
    const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(data);
  }
}

function same(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function line(coordinates: Position[]): GeoJSON.Feature {
  return {
    geometry: { coordinates, type: 'LineString' },
    properties: {},
    type: 'Feature',
  };
}

function point(coordinates: Position, kind: string): GeoJSON.Feature {
  return {
    geometry: { coordinates, type: 'Point' },
    properties: { kind },
    type: 'Feature',
  };
}
