/**
 * The routing graph behind the route editor.
 *
 * A curator clicks waypoints and each leg follows the network between them —
 * the way gpx.studio and brouter-web work. Because a click snaps to a point
 * part-way along a line, routing between two clicks takes exactly the stretch
 * of trail or road between them, which is how a route uses part of a trail.
 *
 * Two kinds of line go into one graph:
 *
 *   OSM ways       roads, paths, and trails from Overpass, with node ids. Ways
 *                  meet where they share a node, so junctions come from OSM's
 *                  own topology.
 *   Curated trails our own published trails. Chattanooga's came from a GIS
 *                  snapshot and share no nodes with OSM, so they are joined
 *                  to the rest by `stitchDeadEnds`.
 *
 * Every edge costs its length times a factor for the kind of line it is on, so
 * a route prefers our trails and bike infrastructure over busy roads without
 * ruling roads out.
 *
 * Directional tags (`oneway`) are ignored on purpose: this traces a line for a
 * map, it is not telling anyone which way to ride.
 *
 * Client-safe: this runs in the admin bundle.
 */
import { haversineDistance } from '@/utils/ride-stats';

export type Position = [number, number];

/** The kinds of line a route can ride on, cheapest first. */
export type WayClass =
  | 'cycleway'
  | 'footway'
  | 'path'
  | 'primary'
  | 'secondary'
  | 'service'
  | 'street'
  | 'tertiary'
  | 'trail';

/**
 * What one meter on each kind of line costs, relative to a quiet street.
 *
 * Tuned so a route takes a modest detour to stay on a trail or cycleway, and a
 * longer one to avoid a primary road — but still uses the road when it is the
 * only connection.
 */
export const COST_FACTORS: Record<WayClass, number> = {
  cycleway: 0.85,
  footway: 1.1,
  path: 0.9,
  primary: 2.5,
  secondary: 1.8,
  service: 1.2,
  street: 1,
  tertiary: 1.3,
  trail: 0.8,
};

/** A painted or separated bike lane makes a road this much more attractive. */
export const BIKE_LANE_DISCOUNT = 0.8;

/**
 * A stitched connector crosses ground no line covers — a few meters of grass
 * between a GIS trail's end and the road it meets — so it costs a little more
 * than riding a real line.
 */
const CONNECTOR_FACTOR = 1.5;

/** The cheapest any meter can be; keeps the A* heuristic admissible. */
const MIN_FACTOR = Math.min(
  ...Object.values(COST_FACTORS).map((factor) => factor * BIKE_LANE_DISCOUNT),
);

/**
 * A dead end this close to another line joins it. Generous enough to bridge a
 * GIS trail ending at the edge of a road's centreline, tight enough not to
 * invent a crossing between two lines that merely run near each other.
 */
export const STITCH_METERS = 12;

/** Within this of an existing node, a stitch reuses it rather than splitting. */
const SAME_NODE_METERS = 2;

/**
 * A curated-trail vertex this close to another line's vertex is a junction.
 * Tighter than `STITCH_METERS` because it applies along a trail's whole
 * length, not only at its ends.
 */
const JUNCTION_METERS = 5;

/** How far a click may land from the network and still snap to it. */
export const SNAP_METERS = 60;

/**
 * A curated trail this much further away than the nearest line still wins
 * the snap. OSM often maps the same trail a few meters from our line, and a
 * click meant for the trail should ride on — and be named for — the trail.
 */
const TRAIL_SNAP_PREFERENCE_METERS = 10;

/** Grid cell size for the spatial index, in degrees — about 100 m. */
const GRID_DEG = 0.001;

/** One OSM way as the network endpoint returns it. */
export interface NetworkWay {
  class: WayClass;
  /** [lng, lat] per node, in the same order as `nodes`. */
  coordinates: Position[];
  hasBikeLane: boolean;
  id: number;
  name: string | null;
  nodes: number[];
}

/** One of our published trails, as the public trail GeoJSON carries it. */
export interface CuratedTrail {
  name: string;
  parts: Position[][];
  slug: string;
}

/** What a stretch of route rides on. */
export type StepSource =
  | { class: WayClass; id: number; kind: 'osm'; name: string | null }
  | { kind: 'connector' }
  | { kind: 'straight' }
  | { kind: 'trail'; name: string; slug: string };

/** A stretch of route on one source, for the leg breakdown. */
export interface RouteStep {
  meters: number;
  source: StepSource;
}

interface Edge {
  cost: number;
  meters: number;
  /** Index into `sources`, or -1 for a stitched connector. */
  source: number;
  to: number;
}

interface Segment {
  a: number;
  b: number;
  source: number;
}

export interface RouteGraph {
  edges: Map<number, Edge[]>;
  grid: Map<string, number[]>;
  nodes: Map<number, Position>;
  segments: Segment[];
  sources: StepSource[];
}

/** Where a point landed on the graph: part-way along one segment. */
export interface GraphSnap {
  distanceMeters: number;
  from: number;
  metersToFrom: number;
  metersToTo: number;
  point: Position;
  /** Index into `segments`. */
  segment: number;
  source: number;
  to: number;
}

export interface GraphRoute {
  coordinates: Position[];
  steps: RouteStep[];
}

/**
 * Builds one graph from OSM ways and curated trails.
 *
 * Rebuilt from scratch whenever more of the network loads rather than patched
 * in place: a build over a few square kilometres takes milliseconds, and a
 * from-scratch build can't leave a stale stitch behind.
 */
export function buildRouteGraph({
  trails,
  ways,
}: {
  trails: CuratedTrail[];
  ways: NetworkWay[];
}): RouteGraph {
  const graph: RouteGraph = {
    edges: new Map(),
    grid: new Map(),
    nodes: new Map(),
    segments: [],
    sources: [],
  };

  const seenWays = new Set<number>();
  for (const way of ways) {
    if (seenWays.has(way.id) || way.nodes.length !== way.coordinates.length) {
      continue;
    }
    seenWays.add(way.id);
    const source = graph.sources.length;
    graph.sources.push({
      class: way.class,
      id: way.id,
      kind: 'osm',
      name: way.name,
    });
    const factor =
      COST_FACTORS[way.class] * (way.hasBikeLane ? BIKE_LANE_DISCOUNT : 1);
    for (let index = 0; index < way.nodes.length; index++) {
      graph.nodes.set(way.nodes[index], way.coordinates[index]);
      if (index > 0 && way.nodes[index - 1] !== way.nodes[index]) {
        addSegment(
          graph,
          way.nodes[index - 1],
          way.nodes[index],
          source,
          factor,
        );
      }
    }
  }

  // Curated trails get negative ids so they can never collide with OSM's.
  let nextId = -1;
  const trailNodeSources = new Map<number, number>();
  const seenTrails = new Set<string>();
  for (const trail of trails) {
    if (seenTrails.has(trail.slug)) {
      continue;
    }
    seenTrails.add(trail.slug);
    const source = graph.sources.length;
    graph.sources.push({ kind: 'trail', name: trail.name, slug: trail.slug });
    for (const part of trail.parts) {
      let previous: number | null = null;
      for (const position of part) {
        const id = nextId--;
        graph.nodes.set(id, position);
        trailNodeSources.set(id, source);
        if (previous !== null) {
          addSegment(graph, previous, id, source, COST_FACTORS.trail);
        }
        previous = id;
      }
    }
  }

  stitchDeadEnds(graph, () => nextId--);
  joinTrailVertices(graph, trailNodeSources);
  return graph;
}

/**
 * Joins every dead end to the nearest other line within `STITCH_METERS`.
 *
 * A dead end is a node with one edge. In OSM most are real — a trail that
 * stops — but where a GIS trail meets a road, or an OSM way ends a few meters
 * short of the trail it obviously joins, the dead end is a gap in the data,
 * and without a stitch the router would treat the two as unconnected. Bounded
 * by the number of dead ends; each does one grid lookup.
 */
function stitchDeadEnds(graph: RouteGraph, newId: () => number): void {
  // Decided up front, before any stitch changes a node's degree: a loop
  // trail's two ends stitch to each other, and must still count as dead ends
  // when it comes to reaching the rest of the network.
  const deadEnds = [...graph.edges]
    .filter(([, edges]) => edges.length === 1)
    .map(([id, edges]) => ({ id, source: edges[0].source }));

  for (const { id, source } of deadEnds) {
    const position = graph.nodes.get(id);
    if (!position) {
      continue;
    }
    // Another line first — that is the gap that disconnects whole trails —
    // then a gap inside the same line, such as a GIS trail's split parts.
    for (const accept of [
      (other: number) => other !== source,
      (other: number) => other === source,
    ]) {
      const snap = snapToGraph(graph, position, STITCH_METERS, {
        accept,
        exclude: id,
        preferTrails: false,
      });
      if (!snap) {
        continue;
      }
      const target =
        snap.metersToFrom <= SAME_NODE_METERS
          ? snap.from
          : snap.metersToTo <= SAME_NODE_METERS
            ? snap.to
            : splitSegment(graph, snap, newId());
      connect(graph, id, target);
    }
  }
}

/**
 * Joins each curated-trail vertex to any vertex of another line within
 * `JUNCTION_METERS`.
 *
 * Dead ends only cover trails that *end* at a junction. A GIS trail crossing a
 * road, or running on top of OSM's own copy of the same trail, meets it
 * mid-line — usually at a vertex both sides happen to have. Bounded by the
 * number of curated vertices; each does one small grid lookup.
 */
function joinTrailVertices(
  graph: RouteGraph,
  nodeSources: Map<number, number>,
) {
  for (const [id, source] of nodeSources) {
    const position = graph.nodes.get(id);
    if (!position) {
      continue;
    }
    let nearest: number | null = null;
    let nearestMeters = JUNCTION_METERS;
    for (const index of segmentsNear(graph, position, JUNCTION_METERS)) {
      const segment = graph.segments[index];
      if (segment.source === source) {
        continue;
      }
      for (const candidate of [segment.a, segment.b]) {
        const point = graph.nodes.get(candidate);
        const meters = point
          ? distance(position, point)
          : Number.POSITIVE_INFINITY;
        if (meters <= nearestMeters) {
          nearest = candidate;
          nearestMeters = meters;
        }
      }
    }
    if (nearest !== null) {
      connect(graph, id, nearest);
    }
  }
}

/** A connector edge both ways, unless the two are already adjacent. */
function connect(graph: RouteGraph, a: number, b: number): void {
  if (a === b || isNeighbour(graph, a, b)) {
    return;
  }
  const pa = graph.nodes.get(a);
  const pb = graph.nodes.get(b);
  if (!pa || !pb) {
    return;
  }
  const meters = distance(pa, pb);
  const cost = meters * CONNECTOR_FACTOR;
  addEdge(graph, a, { cost, meters, source: -1, to: b });
  addEdge(graph, b, { cost, meters, source: -1, to: a });
}

/**
 * Finds the nearest point on the graph to `point`, within `maxMeters`.
 *
 * `exclude` skips segments touching that node, so a dead end being stitched
 * doesn't snap onto its own line.
 */
export function snapToGraph(
  graph: RouteGraph,
  point: Position,
  maxMeters = SNAP_METERS,
  {
    accept,
    exclude,
    preferTrails = true,
  }: {
    /** Only segments whose source passes. */
    accept?: (source: number) => boolean;
    /** Skip segments touching this node. */
    exclude?: number;
    preferTrails?: boolean;
  } = {},
): GraphSnap | null {
  const project = flatProjection(point);
  const candidates = segmentsNear(graph, point, maxMeters);

  let best: GraphSnap | null = null;
  let bestTrail: GraphSnap | null = null;
  for (const index of candidates) {
    const segment = graph.segments[index];
    if (
      segment.a === exclude ||
      segment.b === exclude ||
      (accept && !accept(segment.source))
    ) {
      continue;
    }
    const a = graph.nodes.get(segment.a);
    const b = graph.nodes.get(segment.b);
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
    const isTrail =
      preferTrails && graph.sources[segment.source]?.kind === 'trail';
    if (
      distanceMeters <= maxMeters &&
      (best === null ||
        distanceMeters < best.distanceMeters ||
        (isTrail &&
          (bestTrail === null || distanceMeters < bestTrail.distanceMeters)))
    ) {
      const segmentMeters = Math.sqrt(lengthSquared);
      const snap: GraphSnap = {
        distanceMeters,
        from: segment.a,
        metersToFrom: t * segmentMeters,
        metersToTo: (1 - t) * segmentMeters,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        segment: index,
        source: segment.source,
        to: segment.b,
      };
      if (best === null || distanceMeters < best.distanceMeters) {
        best = snap;
      }
      if (
        isTrail &&
        (bestTrail === null || distanceMeters < bestTrail.distanceMeters)
      ) {
        bestTrail = snap;
      }
    }
  }
  return bestTrail &&
    best &&
    bestTrail.distanceMeters <=
      best.distanceMeters + TRAIL_SNAP_PREFERENCE_METERS
    ? bestTrail
    : best;
}

/** Virtual node ids for the two snapped ends. Real ids never get this large. */
const START = Number.MAX_SAFE_INTEGER;
const END = Number.MAX_SAFE_INTEGER - 1;

/**
 * The cheapest path between two snapped points, or null when nothing
 * connects them.
 *
 * A* with straight-line distance × the cheapest factor as the heuristic, which
 * never overestimates and so still finds the cheapest path. Each snapped point
 * enters the search as a virtual node joined to both ends of its segment.
 * Bounded by the size of the graph: each node is settled at most once.
 */
export function routeBetween(
  graph: RouteGraph,
  a: GraphSnap,
  b: GraphSnap,
): GraphRoute | null {
  const factorOf = (snap: GraphSnap) => {
    const segment = graph.edges
      .get(snap.from)
      ?.find((edge) => edge.to === snap.to);
    return segment && segment.meters > 0 ? segment.cost / segment.meters : 1;
  };
  const startFactor = factorOf(a);
  const endFactor = factorOf(b);

  // Both ends on one segment: riding straight along it is one option, but not
  // necessarily the cheapest — a trail beside a long road segment can be
  // cheaper — so it goes in as an edge rather than as a shortcut answer.
  const sameSegment =
    a.segment === b.segment
      ? Math.abs(
          a.metersToFrom - (a.from === b.from ? b.metersToFrom : b.metersToTo),
        )
      : null;

  const neighbours = (node: number): Edge[] => {
    const out: Edge[] =
      node === START
        ? [
            {
              cost: a.metersToFrom * startFactor,
              meters: a.metersToFrom,
              source: a.source,
              to: a.from,
            },
            {
              cost: a.metersToTo * startFactor,
              meters: a.metersToTo,
              source: a.source,
              to: a.to,
            },
            ...(sameSegment === null
              ? []
              : [
                  {
                    cost: sameSegment * startFactor,
                    meters: sameSegment,
                    source: a.source,
                    to: END,
                  },
                ]),
          ]
        : [...(graph.edges.get(node) ?? [])];
    if (node === b.from) {
      out.push({
        cost: b.metersToFrom * endFactor,
        meters: b.metersToFrom,
        source: b.source,
        to: END,
      });
    }
    if (node === b.to) {
      out.push({
        cost: b.metersToTo * endFactor,
        meters: b.metersToTo,
        source: b.source,
        to: END,
      });
    }
    return out;
  };

  const heuristic = (node: number) =>
    node === END
      ? 0
      : distance(graph.nodes.get(node) ?? a.point, b.point) * MIN_FACTOR;

  const cost = new Map<number, number>([[START, 0]]);
  const previous = new Map<number, { edge: Edge; from: number }>();
  const settled = new Set<number>();
  const queue = new MinHeap();
  queue.push(START, heuristic(START));

  while (queue.size > 0) {
    const node = queue.pop();
    if (settled.has(node)) {
      continue;
    }
    if (node === END) {
      break;
    }
    settled.add(node);
    const base = cost.get(node) ?? Number.POSITIVE_INFINITY;
    for (const edge of neighbours(node)) {
      const next = base + edge.cost;
      if (next < (cost.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        cost.set(edge.to, next);
        previous.set(edge.to, { edge, from: node });
        queue.push(edge.to, next + heuristic(edge.to));
      }
    }
  }

  if (!previous.has(END)) {
    return null;
  }

  const hops: { edge: Edge; node: number }[] = [];
  for (let node = END; node !== START; ) {
    const step = previous.get(node);
    if (!step) {
      return null;
    }
    hops.push({ edge: step.edge, node });
    node = step.from;
  }
  hops.reverse();

  const coordinates: Position[] = [a.point];
  const steps: RouteStep[] = [];
  for (const { edge, node } of hops) {
    coordinates.push(
      node === END ? b.point : (graph.nodes.get(node) ?? b.point),
    );
    appendStep(steps, edge.meters, sourceOf(graph, edge.source));
  }

  return { coordinates: dropRepeats(coordinates), steps };
}

/**
 * Adds a stretch to a step list, merging it into the last step when it rides
 * on the same thing. Connectors are a few meters and say nothing useful, so
 * they fold into whatever came before them.
 */
export function appendStep(
  steps: RouteStep[],
  meters: number,
  source: StepSource,
): void {
  if (meters <= 0) {
    return;
  }
  const last = steps.at(-1);
  if (
    last &&
    (source.kind === 'connector' || sameSource(last.source, source))
  ) {
    last.meters += meters;
    return;
  }
  steps.push({ meters, source });
}

export function sameSource(a: StepSource, b: StepSource): boolean {
  if (a.kind === 'osm' && b.kind === 'osm') {
    // Consecutive OSM ways with the same name are one street to a rider.
    return a.name !== null ? a.name === b.name : a.id === b.id;
  }
  if (a.kind === 'trail' && b.kind === 'trail') {
    return a.slug === b.slug;
  }
  return a.kind === b.kind;
}

export function distance(a: Position, b: Position): number {
  return haversineDistance(a[1], a[0], b[1], b[0]);
}

function sourceOf(graph: RouteGraph, index: number): StepSource {
  return graph.sources[index] ?? { kind: 'connector' };
}

function addSegment(
  graph: RouteGraph,
  a: number,
  b: number,
  source: number,
  factor: number,
): void {
  const pa = graph.nodes.get(a);
  const pb = graph.nodes.get(b);
  if (!pa || !pb) {
    return;
  }
  const meters = distance(pa, pb);
  const cost = meters * factor;
  addEdge(graph, a, { cost, meters, source, to: b });
  addEdge(graph, b, { cost, meters, source, to: a });
  indexSegment(graph, graph.segments.push({ a, b, source }) - 1);
}

/**
 * Splits a segment at a snapped point, returning the new node's id.
 *
 * The original segment keeps its index (now ending at the new node) and the
 * second half is appended and indexed. The grid entries for the original
 * index cover its whole old extent, a superset of the first half, so they
 * remain correct.
 */
function splitSegment(graph: RouteGraph, snap: GraphSnap, id: number): number {
  const { from, to } = snap;
  const forward = graph.edges.get(from)?.find((edge) => edge.to === to);
  if (!forward) {
    return from;
  }
  const factor = forward.meters > 0 ? forward.cost / forward.meters : 1;
  graph.nodes.set(id, snap.point);

  removeEdge(graph, from, to);
  removeEdge(graph, to, from);
  graph.segments[snap.segment] = { a: from, b: id, source: forward.source };

  for (const [a, b, meters] of [
    [from, id, snap.metersToFrom],
    [id, to, snap.metersToTo],
  ] as const) {
    const cost = meters * factor;
    addEdge(graph, a, { cost, meters, source: forward.source, to: b });
    addEdge(graph, b, { cost, meters, source: forward.source, to: a });
  }
  indexSegment(
    graph,
    graph.segments.push({ a: id, b: to, source: forward.source }) - 1,
  );
  return id;
}

function addEdge(graph: RouteGraph, from: number, edge: Edge): void {
  const list = graph.edges.get(from);
  if (list) {
    list.push(edge);
  } else {
    graph.edges.set(from, [edge]);
  }
}

function removeEdge(graph: RouteGraph, from: number, to: number): void {
  const list = graph.edges.get(from);
  if (list) {
    graph.edges.set(
      from,
      list.filter((edge) => edge.to !== to),
    );
  }
}

function isNeighbour(graph: RouteGraph, a: number, b: number): boolean {
  return (graph.edges.get(a) ?? []).some((edge) => edge.to === b);
}

function indexSegment(graph: RouteGraph, index: number): void {
  const { a, b } = graph.segments[index];
  const pa = graph.nodes.get(a);
  const pb = graph.nodes.get(b);
  if (!pa || !pb) {
    return;
  }
  for (const key of cellsIn(
    Math.min(pa[0], pb[0]),
    Math.min(pa[1], pb[1]),
    Math.max(pa[0], pb[0]),
    Math.max(pa[1], pb[1]),
  )) {
    const list = graph.grid.get(key);
    if (list) {
      list.push(index);
    } else {
      graph.grid.set(key, [index]);
    }
  }
}

/** Indexes of every segment in the grid cells within `meters` of `point`. */
function segmentsNear(
  graph: RouteGraph,
  [lng, lat]: Position,
  meters: number,
): Set<number> {
  const latRadius = meters / 111_320;
  const lngRadius = latRadius / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const found = new Set<number>();
  for (const key of cellsIn(
    lng - lngRadius,
    lat - latRadius,
    lng + lngRadius,
    lat + latRadius,
  )) {
    for (const index of graph.grid.get(key) ?? []) {
      found.add(index);
    }
  }
  return found;
}

function cellsIn(
  west: number,
  south: number,
  east: number,
  north: number,
): string[] {
  const keys: string[] = [];
  for (
    let x = Math.floor(west / GRID_DEG);
    x <= Math.floor(east / GRID_DEG);
    x++
  ) {
    for (
      let y = Math.floor(south / GRID_DEG);
      y <= Math.floor(north / GRID_DEG);
      y++
    ) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

/** Meters east/north of `origin` — accurate to well under a meter nearby. */
function flatProjection(origin: Position): (p: Position) => [number, number] {
  const metersPerDegLat = 111_320;
  const metersPerDegLng =
    metersPerDegLat * Math.cos((origin[1] * Math.PI) / 180);
  return ([lng, lat]) => [
    (lng - origin[0]) * metersPerDegLng,
    (lat - origin[1]) * metersPerDegLat,
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

/** A binary min-heap of node ids keyed by priority. */
class MinHeap {
  private items: { node: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: number, priority: number): void {
    const items = this.items;
    items.push({ node, priority });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].priority <= items[index].priority) {
        break;
      }
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < items.length &&
          items[left].priority < items[smallest].priority
        ) {
          smallest = left;
        }
        if (
          right < items.length &&
          items[right].priority < items[smallest].priority
        ) {
          smallest = right;
        }
        if (smallest === index) {
          break;
        }
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top.node;
  }
}
