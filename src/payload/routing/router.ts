/**
 * Routes one leg of a plan over the graph.
 *
 * Client-safe: the route editor calls this as waypoints change.
 */
import {
  distance,
  type GraphSnap,
  type Position,
  type RouteGraph,
  type RouteStep,
  routeBetween,
  snapToGraph,
} from './graph';
import { type LegMode, type RouteLeg, straightLeg } from './plan';

/**
 * How far a waypoint may sit from the network and still count as on it.
 *
 * Clicks are snapped when placed, so this only matters after the graph has
 * changed underneath them — a stitch moved, or the network loaded differently.
 */
const WAYPOINT_SNAP_METERS = 30;

/**
 * How far a waypoint that is *off* the network — a trailhead lot, a park
 * lawn, a click just past the snap radius — may be from the nearest trail or
 * road and still be reached by a straight approach.
 *
 * Without it, one waypoint a few meters too far from a line made its whole
 * leg a straight line, however much of it the network covered.
 */
const APPROACH_METERS = 250;

/** Closer than this, a waypoint and its snapped point are the same place. */
const ON_NETWORK_METERS = 1;

/**
 * Routes a leg between two waypoints. Never fails: a leg the network can't
 * connect comes back straight and flagged `isUnrouted`, so the route stays
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
  const a = snapNear(graph, from);
  const b = snapNear(graph, to);
  const route = a && b ? routeBetween(graph, a, b) : null;
  if (!a || !b || !route) {
    return straightLeg(from, to, 'network');
  }

  // The leg starts and ends exactly on its waypoints, so consecutive legs
  // always meet. A waypoint on the network replaces the snapped end; one off
  // it is joined by a straight approach, which the breakdown reports.
  const coordinates: Position[] = route.coordinates.slice(1, -1);
  const steps: RouteStep[] = [...route.steps];
  const approach = distance(from, a.point);
  const departure = distance(b.point, to);
  if (approach > ON_NETWORK_METERS) {
    coordinates.unshift(a.point);
    steps.unshift({ meters: approach, source: { kind: 'straight' } });
  }
  if (departure > ON_NETWORK_METERS) {
    coordinates.push(b.point);
    steps.push({ meters: departure, source: { kind: 'straight' } });
  }
  return {
    coordinates: [from, ...coordinates, to],
    mode: 'network',
    steps,
  };
}

function snapNear(graph: RouteGraph, point: Position): GraphSnap | null {
  return (
    snapToGraph(graph, point, WAYPOINT_SNAP_METERS) ??
    snapToGraph(graph, point, APPROACH_METERS)
  );
}
