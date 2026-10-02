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
 * The network arrives one fixed grid cell at a time from the trails network
 * endpoint (see `trail-network.ts`), fetched one request at a time so panning
 * across an area never bursts the public Overpass instance.
 */
import type mapboxgl from 'mapbox-gl';
import {
  addWays,
  cellBounds,
  cellsCovering,
  createTrailNetwork,
  MIN_NETWORK_ZOOM,
  type NetworkSnap,
  type NetworkWay,
  routeBetween,
  snapToNetwork,
} from '@/payload/osm/trail-network';

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

export interface RouteToolHost {
  /** Commits a finished route as one undoable edit. */
  apply(next: Parts): void;
  fetchNetwork(bbox: [number, number, number, number]): Promise<NetworkWay[]>;
  getParts(): Parts;
  isActive(): boolean;
  onStatus(status: RouteStatus): void;
}

export interface RouteTool {
  /** Starts loading the network for the view. Call on entering the mode. */
  activate(): void;
  /** Throws away the route being built. */
  cancel(): void;
  /** Keeps whatever route is in progress and clears the preview. Call on leaving the mode. */
  deactivate(): void;
  /** Commits the route being built, if it has a leg. */
  finish(): void;
  hasRoute(): boolean;
  /** (Re)adds the tool's layers. Call after every `style.load`. */
  install(): void;
  /** Takes back the last click. Returns false when there was nothing to take back. */
  undoLeg(): boolean;
}

interface Waypoint {
  /** Where the route starts or ends at this click — usually `snap.point`. */
  position: Position;
  /** The network point the click snapped to; null for a free (Alt) click. */
  snap: NetworkSnap | null;
}

const PATH_SOURCE = 'route-tool-path';
const PREVIEW_SOURCE = 'route-tool-preview';
const POINTS_SOURCE = 'route-tool-points';
const ROUTE_COLOR = '#EA580C';

/** How close, in pixels, a click must land to snap to a trail or a line end. */
const SNAP_PIXELS = 30;

/** Clicks closer than this to the last one are the second half of a double-click. */
const DOUBLE_CLICK_PIXELS = 4;

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
  const network = createTrailNetwork();
  const loaded = new Set<string>();
  /** Cells that failed to load, and when — see `RETRY_AFTER_MS`. */
  const failed = new Map<string, number>();
  let queue: string[] = [];
  let isFetching = false;

  let waypoints: Waypoint[] = [];
  /** The route so far, and its length after each leg — what Backspace pops. */
  let path: Position[] = [];
  let legEnds: number[] = [];
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
  let lastClick: mapboxgl.Point | null = null;
  /** What the preview last drew, so an unmoved target skips the route search. */
  let previewKey = '';

  function report(patch: Partial<RouteStatus>) {
    status = { ...status, ...patch, waypoints: waypoints.length };
    host.onStatus(status);
  }

  // --- the network ------------------------------------------------------

  function loadView() {
    if (!host.isActive()) {
      return;
    }
    if (map.getZoom() < MIN_NETWORK_ZOOM) {
      report({
        network: 'zoom',
        networkMessage: 'Zoom in to load trails to follow.',
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
              networkMessage:
                'Some trails could not be loaded. Retrying shortly…',
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
        report({ network: 'loading', networkMessage: 'Loading trails…' });
        try {
          addWays(network, await host.fetchNetwork(cellBounds(key)));
          loaded.add(key);
          failed.delete(key);
        } catch (error) {
          failed.set(key, Date.now());
          setTimeout(loadView, RETRY_AFTER_MS);
          report({
            network: 'error',
            networkMessage:
              error instanceof Error
                ? error.message
                : 'Trails could not be loaded.',
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
    if (isFree) {
      return { position: click, snap: null };
    }
    const snap = snapToNetwork(network, click, snapMeters(at));
    return { position: snap?.point ?? click, snap };
  }

  /** The leg from one waypoint to the next, and whether it had to go straight. */
  function legBetween(from: Waypoint, to: Waypoint) {
    const routed =
      from.snap && to.snap ? routeBetween(network, from.snap, to.snap) : null;
    if (!routed) {
      return {
        coordinates: [from.position, to.position],
        isStraight: Boolean(from.snap && to.snap),
      };
    }
    // A route starting on a line end that is off the network begins at that
    // end, then joins the trail.
    const start = same(routed[0], from.position) ? [] : [from.position];
    return { coordinates: [...start, ...routed], isStraight: false };
  }

  function onClick(event: mapboxgl.MapMouseEvent) {
    if (!host.isActive()) {
      return;
    }
    const isFree = event.originalEvent.altKey;
    // The second click of a double-click lands where the first did; it finishes
    // the route (see `onDoubleClick`) and must not add a leg of its own. Judged
    // by the pointer, not the snapped position, which can differ by a hair.
    const isRepeat =
      lastClick !== null && event.point.dist(lastClick) < DOUBLE_CLICK_PIXELS;
    lastClick = event.point;

    if (waypoints.length === 0) {
      const end = isFree ? null : nearbyEnd(event.lngLat);
      if (end) {
        const part = host.getParts()[end.part];
        const position = end.atStart ? part[0] : part[part.length - 1];
        extend = { atStart: end.atStart, part: end.part };
        const snap = snapToNetwork(network, position, snapMeters(event.lngLat));
        waypoints = [{ position, snap }];
      } else {
        extend = null;
        waypoints = [waypointAt(event.lngLat, isFree)];
      }
      path = [waypoints[0].position];
      legEnds = [1];
      render();
      report({ note: null });
      return;
    }

    const previous = waypoints[waypoints.length - 1];
    const next = waypointAt(event.lngLat, isFree);
    if (isRepeat || same(next.position, previous.position)) {
      return;
    }
    const leg = legBetween(previous, next);
    waypoints.push(next);
    path = [...path, ...leg.coordinates.slice(1)];
    legEnds.push(path.length);
    render();
    report({
      note: leg.isStraight
        ? 'No trail connects those two points, so they are joined with a straight line. Undo takes it back.'
        : null,
    });
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
    const target = waypointAt(cursor, isAltDown);
    const key = `${waypoints.length}:${target.position.join(',')}`;
    if (key === previewKey) {
      return;
    }
    previewKey = key;
    const features: GeoJSON.Feature[] = [point(target.position, 'cursor')];
    const previous = waypoints[waypoints.length - 1];
    if (previous && !same(previous.position, target.position)) {
      features.push(line(legBetween(previous, target).coordinates));
    }
    setData(PREVIEW_SOURCE, { features, type: 'FeatureCollection' });
  }

  function render() {
    setData(
      PATH_SOURCE,
      path.length > 1
        ? { features: [line(path)], type: 'FeatureCollection' }
        : EMPTY,
    );
    setData(POINTS_SOURCE, {
      features: waypoints.map((waypoint) =>
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

  function reset() {
    waypoints = [];
    path = [];
    legEnds = [];
    extend = null;
    render();
    setData(PREVIEW_SOURCE, EMPTY);
  }

  function finish() {
    if (path.length < 2) {
      reset();
      report({ note: null });
      return;
    }
    const parts = host.getParts().map((part) => [...part]);
    const target = extend ? parts[extend.part] : undefined;
    if (extend && target) {
      // The route starts at the piece's end, so that point is already there.
      parts[extend.part] = extend.atStart
        ? [...[...path].reverse().slice(0, -1), ...target]
        : [...target, ...path.slice(1)];
    } else {
      parts.push(path);
    }
    reset();
    host.apply(parts);
    report({ note: null });
  }

  // --- wiring -------------------------------------------------------------

  map.on('click', onClick);
  map.on('dblclick', onDoubleClick);
  map.on('mousemove', onMove);
  map.on('moveend', loadView);

  return {
    activate() {
      failed.clear();
      map.getCanvas().style.cursor = 'crosshair';
      loadView();
    },
    cancel() {
      reset();
      report({ note: null });
    },
    deactivate() {
      // Switching modes mid-route keeps the work rather than discarding it.
      finish();
      cursor = null;
      lastClick = null;
      previewKey = '';
      setData(PREVIEW_SOURCE, EMPTY);
    },
    finish,
    hasRoute: () => waypoints.length > 0,
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
    undoLeg() {
      if (waypoints.length === 0) {
        return false;
      }
      waypoints.pop();
      legEnds.pop();
      if (waypoints.length === 0) {
        reset();
      } else {
        path = path.slice(0, legEnds[legEnds.length - 1]);
        render();
      }
      report({ note: null });
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
