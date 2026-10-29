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
import { boundsOfCell, cellCoordinatesCovering } from '@/payload/routing/grid';
import { shortestPath } from '@/payload/routing/shortest-path';
import {
  createSegmentIndex,
  indexSegment,
  type SegmentIndex,
} from '@/payload/routing/segment-index';
import {
  distance,
  isPosition,
  type Position,
} from '@/payload/routing/geometry';
import { snapToSegments } from '@/payload/routing/segment-snap';
import { dropRepeatedPoints } from './geometry';

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

export interface TrailNetwork extends SegmentIndex {
  edges: Map<number, NetworkEdge[]>;
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

export function createTrailNetwork(): TrailNetwork {
  return {
    edges: new Map(),
    ...createSegmentIndex(SNAP_GRID_DEG),
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
      indexSegment(
        network,
        network.segments.length,
        way.coordinates[index - 1],
        way.coordinates[index],
      );
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
  const snap = snapToSegments(
    network,
    network.nodes,
    (index) => {
      const [a, b] = network.segments[index];
      return { a, b };
    },
    point,
    maxMeters,
  );
  if (!snap) return null;
  return {
    distanceMeters: snap.distanceMeters,
    from: snap.from,
    to: snap.to,
    point: snap.point,
    metersToFrom: snap.metersToFrom,
    metersToTo: snap.metersToTo,
  };
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
    return dropRepeatedPoints([a.point, b.point]);
  }

  const goal = b.point;
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

  const hops = shortestPath(
    START,
    END,
    neighbours,
    (node) =>
      node === END ? 0 : distance(network.nodes.get(node) ?? a.point, goal),
    (edge) => edge.meters,
  );
  if (!hops) return null;
  return dropRepeatedPoints([
    a.point,
    ...hops.map(({ node }) =>
      node === END ? goal : (network.nodes.get(node) ?? goal),
    ),
  ]);
}

/** Grid cell keys covering a [west, south, east, north] box. */
export function cellsCovering([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): string[] {
  return cellCoordinatesCovering(
    [west, south, east, north],
    NETWORK_CELL_DEG,
  ).map(([x, y]) => `${x}:${y}`);
}

/**
 * A cell's [west, south, east, north] box.
 *
 * Rounded so a cell always produces the same string — which is what the
 * server's cache is keyed on.
 */
export function cellBounds(key: string): [number, number, number, number] {
  const [x, y] = key.split(':').map(Number);
  return boundsOfCell(x, y, NETWORK_CELL_DEG);
}

function link(network: TrailNetwork, from: number, to: number, meters: number) {
  const edges = network.edges.get(from);
  if (edges) edges.push({ meters, to });
  else network.edges.set(from, [{ meters, to }]);
}
