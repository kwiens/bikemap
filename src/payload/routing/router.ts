/**
 * Routes one leg of a plan over the graph.
 *
 * Client-safe: the route editor calls this as waypoints change.
 */
import {
  type Position,
  type RouteGraph,
  routeBetween,
  snapToGraph,
} from './graph';
import { type LegMode, type RouteLeg, straightLeg } from './plan';

/**
 * How far a stored waypoint may sit from the network and still route.
 *
 * Waypoints are snapped when placed, so this only matters after the graph has
 * changed underneath them — a stitch moved, or the network loaded differently.
 */
const WAYPOINT_SNAP_METERS = 30;

/**
 * Routes a leg between two waypoints. Never fails: a leg the network can't
 * connect comes back straight and flagged `unrouted`, so the route stays
 * drawable and the editor can say which leg needs another waypoint.
 */
export function routeLeg(
  graph: RouteGraph,
  from: Position,
  to: Position,
  mode: LegMode,
): RouteLeg {
  if (mode === 'straight') {
    return straightLeg(from, to, 'straight');
  }
  const a = snapToGraph(graph, from, WAYPOINT_SNAP_METERS);
  const b = snapToGraph(graph, to, WAYPOINT_SNAP_METERS);
  const route = a && b ? routeBetween(graph, a, b) : null;
  if (!route) {
    return straightLeg(from, to, 'network');
  }
  // The leg starts and ends exactly on its waypoints, so consecutive legs
  // always meet and the joined line has no hairline gaps.
  const inner = route.coordinates.slice(1, -1);
  return {
    coordinates: [from, ...inner, to],
    mode: 'network',
    steps: route.steps,
  };
}
