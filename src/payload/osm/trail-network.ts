/**
 * Routing over the OSM trail network, for the editor's Follow trails mode.
 *
 * A curator clicks two points and the line follows the trails between them,
 * the way gpx.studio and brouter-web do. The graph is built from the same
 * bike-relevant ways the editor already draws, fetched from Overpass with
 * their **node ids** — which is what makes it a graph at all. Two ways meet
 * where they share a node, so junctions come from OSM's own topology rather
 * than from coordinates that happen to match. Vector tiles can't do this: they
 * are clipped at tile edges and simplified, so junction vertices go missing.
 *
 * Directional MTB trails carry `oneway=yes`. That is ignored on purpose: this
 * traces geometry for a map, it is not telling anyone which way to ride.
 *
 * Client-safe, like `geometry.ts` — this runs in the admin bundle.
 */
import { haversineDistance } from '@/utils/ride-stats';

type Position = [number, number];

/** One OSM way as the network endpoint returns it. */
export interface NetworkWay {
  /** [lng, lat] per node, in the same order as `nodes`. */
  coordinates: Position[];
  id: number;
  name: string | null;
  nodes: number[];
}

interface NetworkEdge {
  meters: number;
  to: number;
}

export interface TrailNetwork {
  edges: Map<number, NetworkEdge[]>;
  /**
   * Segment indexes bucketed by {@link SNAP_GRID_DEG} cell, so snapping looks
   * at the few segments near the pointer rather than all of them — it runs on
   * every animation frame while Follow trails previews the next leg.
   */
  grid: Map<string, number[]>;
  /** Long segments checked directly instead of expanding their bounding boxes. */
  unindexedSegments: number[];
  nodes: Map<number, Position>;
  /** Every segment once, as node-id pairs — what snapping searches. */
  segments: [number, number][];
  wayIds: Set<number>;
}

/** Where a click landed on the network: a point part-way along one segment. */
export interface NetworkSnap {
  /** How far the click was from the network. */
  distanceMeters: number;
  from: number;
  /** Meters from the snapped point back to `from`. */
  metersToFrom: number;
  /** Meters from the snapped point on to `to`. */
  metersToTo: number;
  point: Position;
  to: number;
}

/**
 * The grid the network is fetched in, in degrees: one request per cell.
 *
 * Fixed cells rather than "whatever is on screen" are what make the requests
 * cacheable on both ends — panning back over an area asks for the same cells,
 * which the client already has and the server has cached. About 8 × 11 km at
 * Bend's latitude, so an editing view needs one to four of them.
 */
export const NETWORK_CELL_DEG = 0.1;

/** Below this zoom the view is too large to load the network for. */
export const MIN_NETWORK_ZOOM = 12;

/** Snapping further than this is a guess, not a snap. */
export const MAX_SNAP_METERS = 150;

/** The snapping index's cell size: about 160 × 220 m at Bend's latitude. */
const SNAP_GRID_DEG = 0.002;
/** Bounds each index insertion and query, independent of geographic extent. */
const MAX_SNAP_GRID_CELLS = 256;

const METERS_PER_DEG_LAT = 111_320;

export function createTrailNetwork(): TrailNetwork {
  return {
    edges: new Map(),
    grid: new Map(),
    unindexedSegments: [],
    nodes: new Map(),
    segments: [],
    wayIds: new Set(),
  };
}

/**
 * Adds ways to a network, in place.
 *
 * Neighbouring cells return the same way, and a way already present is
 * skipped, so loading cells in any order or more than once builds the same
 * graph. Bounded by the total number of nodes across the ways given.
 */
export function addWays(network: TrailNetwork, ways: NetworkWay[]): void {
  for (const way of ways) {
    if (
      network.wayIds.has(way.id) ||
      way.nodes.length < 2 ||
      way.nodes.length !== way.coordinates.length
    ) {
      continue;
    }
    network.wayIds.add(way.id);

    for (let index = 0; index < way.nodes.length; index++) {
      if (isPosition(way.coordinates[index])) {
        network.nodes.set(way.nodes[index], way.coordinates[index]);
      }
    }
    for (let index = 1; index < way.nodes.length; index++) {
      const a = way.nodes[index - 1];
      const b = way.nodes[index];
      if (
        a === b ||
        !isPosition(way.coordinates[index - 1]) ||
        !isPosition(way.coordinates[index])
      ) {
        continue;
      }
      const meters = distance(
        way.coordinates[index - 1],
        way.coordinates[index],
      );
      link(network, a, b, meters);
      link(network, b, a, meters);
      indexSegment(network, network.segments.length, [
        way.coordinates[index - 1],
        way.coordinates[index],
      ]);
      network.segments.push([a, b]);
    }
  }
}

/**
 * The nearest point on the network to `point`, or null if nothing is within
 * `maxMeters`.
 *
 * Looks only at segments indexed in the grid cells within `maxMeters` of the
 * point — bounded by the segments in those few cells, not the whole network.
 * Distances use a flat projection around the point, accurate to centimetres at
 * snapping range.
 */
export function snapToNetwork(
  network: TrailNetwork,
  point: Position,
  maxMeters = MAX_SNAP_METERS,
): NetworkSnap | null {
  if (!isPosition(point) || !Number.isFinite(maxMeters) || maxMeters < 0) {
    return null;
  }
  const project = flatProjection(point);
  let best: NetworkSnap | null = null;

  const latDeg = maxMeters / METERS_PER_DEG_LAT;
  const lngDeg =
    maxMeters /
    (METERS_PER_DEG_LAT * Math.max(0.01, Math.cos((point[1] * Math.PI) / 180)));
  const keys = gridCells(
    [point[0] - lngDeg, point[1] - latDeg],
    [point[0] + lngDeg, point[1] + latDeg],
  );
  // A very large search radius scans the existing graph, never an enormous
  // geographic rectangle. Long segments remain snappable at their midpoint.
  const candidates = new Set<number>(network.unindexedSegments);
  if (keys === null) {
    for (let segment = 0; segment < network.segments.length; segment++) {
      candidates.add(segment);
    }
  } else {
    for (const key of keys) {
      for (const segment of network.grid.get(key) ?? []) {
        candidates.add(segment);
      }
    }
  }

  for (const segment of candidates) {
    const [from, to] = network.segments[segment];
    const a = network.nodes.get(from);
    const b = network.nodes.get(to);
    if (!a || !b) {
      continue;
    }
    const [ax, ay] = project(a);
    const [bx, by] = project(b);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const distanceMeters = Math.hypot(ax + t * dx, ay + t * dy);

    if (
      distanceMeters <= maxMeters &&
      (best === null || distanceMeters < best.distanceMeters)
    ) {
      const segmentMeters = Math.sqrt(lengthSquared);
      best = {
        distanceMeters,
        from,
        metersToFrom: t * segmentMeters,
        metersToTo: (1 - t) * segmentMeters,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        to,
      };
    }
  }

  return best;
}

/** Virtual node ids for the two snapped points; OSM node ids are positive. */
const START = -1;
const END = -2;

/**
 * The shortest path along the network between two snapped points, as the
 * coordinates of a line from `a.point` to `b.point`. Null when no trail
 * connects them.
 *
 * A* over the graph, with straight-line distance as the heuristic. Each
 * snapped point sits part-way along a segment, so it enters the search as a
 * virtual node joined to both ends of its segment. Bounded by the size of the
 * network: each node is settled at most once.
 */
export function routeBetween(
  network: TrailNetwork,
  a: NetworkSnap,
  b: NetworkSnap,
): Position[] | null {
  // On the same segment, the segment itself is the route — A* would agree, but
  // only after detouring through an end node and back.
  if (
    (a.from === b.from && a.to === b.to) ||
    (a.from === b.to && a.to === b.from)
  ) {
    return dropRepeats([a.point, b.point]);
  }

  const goal = b.point;
  const cost = new Map<number, number>([[START, 0]]);
  const previous = new Map<number, number>();
  const settled = new Set<number>();
  const queue = new MinHeap();
  queue.push(START, distance(a.point, goal));

  const neighbours = (node: number): NetworkEdge[] => {
    const out: NetworkEdge[] =
      node === START
        ? [
            { meters: a.metersToFrom, to: a.from },
            { meters: a.metersToTo, to: a.to },
          ]
        : [...(network.edges.get(node) ?? [])];
    if (node === b.from) {
      out.push({ meters: b.metersToFrom, to: END });
    }
    if (node === b.to) {
      out.push({ meters: b.metersToTo, to: END });
    }
    return out;
  };

  while (queue.size > 0) {
    const node = queue.pop();
    if (node === END) {
      break;
    }
    if (settled.has(node)) {
      continue;
    }
    settled.add(node);
    const base = cost.get(node) ?? Infinity;

    for (const edge of neighbours(node)) {
      const next = base + edge.meters;
      if (next < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, next);
        previous.set(edge.to, node);
        const position =
          edge.to === END ? goal : (network.nodes.get(edge.to) ?? goal);
        queue.push(edge.to, next + distance(position, goal));
      }
    }
  }

  if (!previous.has(END)) {
    return null;
  }

  const path: Position[] = [goal];
  for (
    let node = previous.get(END) as number;
    node !== START;
    node = previous.get(node) as number
  ) {
    const position = network.nodes.get(node);
    if (position) {
      path.push(position);
    }
  }
  path.push(a.point);
  return dropRepeats(path.reverse());
}

/** Grid cell keys covering a [west, south, east, north] box. */
export function cellsCovering([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): string[] {
  const keys: string[] = [];
  const x0 = Math.floor(west / NETWORK_CELL_DEG);
  const x1 = Math.floor(east / NETWORK_CELL_DEG);
  const y0 = Math.floor(south / NETWORK_CELL_DEG);
  const y1 = Math.floor(north / NETWORK_CELL_DEG);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

/**
 * A cell's [west, south, east, north] box.
 *
 * Rounded so a cell always produces the same string — which is what the
 * server's cache is keyed on.
 */
export function cellBounds(key: string): [number, number, number, number] {
  const [x, y] = key.split(':').map(Number);
  const round = (value: number) => Number(value.toFixed(4));
  return [
    round(x * NETWORK_CELL_DEG),
    round(y * NETWORK_CELL_DEG),
    round((x + 1) * NETWORK_CELL_DEG),
    round((y + 1) * NETWORK_CELL_DEG),
  ];
}

/** Indexes local segments; retains long ones without geographic amplification. */
function indexSegment(
  network: TrailNetwork,
  segment: number,
  [a, b]: [Position, Position],
) {
  const keys = gridCells(
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  );
  if (keys === null) {
    network.unindexedSegments.push(segment);
    return;
  }
  for (const key of keys) {
    const bucket = network.grid.get(key);
    if (bucket) {
      bucket.push(segment);
    } else {
      network.grid.set(key, [segment]);
    }
  }
}

/** Returns null when a box needs the bounded-by-graph-size fallback. */
function gridCells(
  [west, south]: Position,
  [east, north]: Position,
): string[] | null {
  const minX = Math.floor(west / SNAP_GRID_DEG);
  const maxX = Math.floor(east / SNAP_GRID_DEG);
  const minY = Math.floor(south / SNAP_GRID_DEG);
  const maxY = Math.floor(north / SNAP_GRID_DEG);
  const count = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isFinite(count) || count > MAX_SNAP_GRID_CELLS) {
    return null;
  }
  const keys: string[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function link(network: TrailNetwork, from: number, to: number, meters: number) {
  const list = network.edges.get(from);
  if (list) {
    list.push({ meters, to });
  } else {
    network.edges.set(from, [{ meters, to }]);
  }
}

function distance(a: Position, b: Position): number {
  return haversineDistance(a[1], a[0], b[1], b[0]);
}

/** Meters east/north of `origin`. */
function flatProjection([originLng, originLat]: Position) {
  const metersPerDegLng =
    METERS_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180);
  return ([lng, lat]: Position): [number, number] => [
    (lng - originLng) * metersPerDegLng,
    (lat - originLat) * METERS_PER_DEG_LAT,
  ];
}

function dropRepeats(points: Position[]): Position[] {
  return points.filter(
    (point, index) =>
      index === 0 ||
      point[0] !== points[index - 1][0] ||
      point[1] !== points[index - 1][1],
  );
}

/** A binary min-heap of node ids by priority. Duplicates are allowed; stale ones are skipped by the caller. */
class MinHeap {
  private ids: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, priority: number): void {
    this.ids.push(id);
    this.priorities.push(priority);
    let index = this.ids.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[index]) {
        break;
      }
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.priorities[0] = lastPriority;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < this.ids.length &&
          this.priorities[left] < this.priorities[smallest]
        ) {
          smallest = left;
        }
        if (
          right < this.ids.length &&
          this.priorities[right] < this.priorities[smallest]
        ) {
          smallest = right;
        }
        if (smallest === index) {
          break;
        }
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.priorities[a], this.priorities[b]] = [
      this.priorities[b],
      this.priorities[a],
    ];
  }
}
