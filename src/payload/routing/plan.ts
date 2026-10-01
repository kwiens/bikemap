/**
 * A composed route's recipe: the waypoints a curator placed and the legs
 * routed between them.
 *
 * The plan is what the route editor authors and what the database stores in
 * `routes.plan`. The route's `geom`, `distance`, and `bounds` are all derived
 * from it on save (`resolveRouteSource`), so there is exactly one place the
 * line comes from and nothing typed by hand can disagree with it.
 *
 * Keeping the waypoints rather than only the line is what lets the editor
 * re-open a route and keep editing it: drag a waypoint and only the two legs
 * beside it are routed again.
 *
 * Client-safe: shared by the admin editor and the server hook.
 */
import { lengthMeters } from '@/payload/osm/assemble';
import type { TrailGeometry } from '@/payload/osm/geometry';
import {
  appendStep,
  distance,
  type Position,
  type RouteStep,
  type StepSource,
} from './graph';

/** `network` follows trails and roads; `straight` is a deliberate shortcut. */
export type LegMode = 'network' | 'straight';

export interface RouteLeg {
  coordinates: Position[];
  mode: LegMode;
  steps: RouteStep[];
  /**
   * A network leg the router could not connect, drawn straight as a stand-in.
   * Kept distinct from a chosen straight leg so the editor can keep flagging
   * it until a waypoint fixes it.
   */
  unrouted?: boolean;
}

export interface RoutePlan {
  /** Always one fewer than `waypoints`. */
  legs: RouteLeg[];
  version: 1;
  waypoints: Position[];
}

export const EMPTY_PLAN: RoutePlan = { legs: [], version: 1, waypoints: [] };

/** Bounds the stored plan, and so the work every save does on it. */
export const MAX_WAYPOINTS = 200;

export type PlanParse =
  | { error: null; ok: true; plan: RoutePlan }
  | { error: string; ok: false; plan: null };

/**
 * Validates a stored or submitted plan.
 *
 * It arrives as untyped `jsonb` from the browser, and every derived number on
 * the route is computed from it, so it is checked the way `parseTrailGeometry`
 * checks a trail's line. Null and absent read as an empty plan.
 */
export function parseRoutePlan(value: unknown): PlanParse {
  if (value === null || value === undefined || value === '') {
    return { error: null, ok: true, plan: EMPTY_PLAN };
  }
  const raw = typeof value === 'string' ? safeParse(value) : value;
  const fail = (error: string): PlanParse => ({ error, ok: false, plan: null });

  if (!raw || typeof raw !== 'object') {
    return fail('The route plan must be an object.');
  }
  const { legs, waypoints } = raw as { legs?: unknown; waypoints?: unknown };
  if (!Array.isArray(waypoints) || !Array.isArray(legs)) {
    return fail('The route plan must list its waypoints and legs.');
  }
  if (waypoints.length > MAX_WAYPOINTS) {
    return fail(`A route can have at most ${MAX_WAYPOINTS} waypoints.`);
  }
  if (!waypoints.every(isPosition)) {
    return fail('Every waypoint must be a valid [longitude, latitude] pair.');
  }
  const expectedLegs = Math.max(waypoints.length - 1, 0);
  if (legs.length !== expectedLegs) {
    return fail(
      `A route with ${waypoints.length} waypoints must have ${expectedLegs} legs, not ${legs.length}.`,
    );
  }

  const parsedLegs: RouteLeg[] = [];
  for (const [index, leg] of legs.entries()) {
    const { coordinates, mode, steps, unrouted } = (leg ?? {}) as {
      coordinates?: unknown;
      mode?: unknown;
      steps?: unknown;
      unrouted?: unknown;
    };
    if (mode !== 'network' && mode !== 'straight') {
      return fail(`Leg ${index + 1} has an unknown mode.`);
    }
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.every(isPosition)
    ) {
      return fail(`Leg ${index + 1} must be a line of at least two points.`);
    }
    parsedLegs.push({
      coordinates: coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]),
      mode,
      // Steps are a display aid; a malformed one is dropped, not fatal.
      steps: Array.isArray(steps) ? steps.filter(isStep) : [],
      ...(unrouted === true ? { unrouted: true } : {}),
    });
  }

  return {
    error: null,
    ok: true,
    plan: {
      legs: parsedLegs,
      version: 1,
      waypoints: waypoints.map(([lng, lat]) => [Number(lng), Number(lat)]),
    },
  };
}

/**
 * The route's line: its legs joined end to end.
 *
 * Legs meet at their shared waypoint, so the join point is written once. A
 * leg that starts somewhere other than where the last one ended — which a
 * well-formed plan never does — starts a new part rather than drawing a line
 * across the gap.
 */
export function planGeometry(plan: RoutePlan): TrailGeometry | null {
  const parts: Position[][] = [];
  for (const leg of plan.legs) {
    const current = parts.at(-1);
    const end = current?.at(-1);
    if (current && end && distance(end, leg.coordinates[0]) < 1) {
      current.push(...leg.coordinates.slice(1));
    } else {
      parts.push(leg.coordinates.map((point) => [...point] as Position));
    }
  }
  const usable = parts.filter((part) => part.length >= 2);
  return usable.length > 0
    ? { coordinates: usable, type: 'MultiLineString' }
    : null;
}

/** Total length of the plan, in meters. */
export function planMeters(plan: RoutePlan): number {
  return lengthMeters(plan.legs.map((leg) => leg.coordinates));
}

/** What the whole route rides on, in order, with neighbouring stretches merged. */
export function planSteps(plan: RoutePlan): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const leg of plan.legs) {
    for (const step of leg.steps) {
      appendStep(steps, step.meters, { ...step.source });
    }
  }
  return steps;
}

/** A leg drawn as a straight line, for `straight` mode and unroutable gaps. */
export function straightLeg(
  from: Position,
  to: Position,
  mode: LegMode,
): RouteLeg {
  const meters = distance(from, to);
  return {
    coordinates: [from, to],
    mode,
    steps: meters > 0 ? [{ meters, source: { kind: 'straight' } }] : [],
    ...(mode === 'network' ? { unrouted: true } : {}),
  };
}

// --- Edits ----------------------------------------------------------------
//
// Each edit returns the new plan plus the legs that must be routed again. The
// legs it lists hold a straight placeholder until the router replaces them,
// so the plan is always drawable — even while a slow network load is pending.

export interface PlanEdit {
  plan: RoutePlan;
  /** Indexes into `plan.legs` that need routing. */
  reroute: number[];
}

export function appendWaypoint(plan: RoutePlan, point: Position): PlanEdit {
  const last = plan.waypoints.at(-1);
  if (!last) {
    return { plan: { ...plan, waypoints: [point] }, reroute: [] };
  }
  const mode = plan.legs.at(-1)?.mode ?? 'network';
  return {
    plan: {
      ...plan,
      legs: [...plan.legs, straightLeg(last, point, mode)],
      waypoints: [...plan.waypoints, point],
    },
    reroute: [plan.legs.length],
  };
}

/** Puts a new waypoint in the middle of leg `legIndex`, splitting it in two. */
export function insertWaypoint(
  plan: RoutePlan,
  legIndex: number,
  point: Position,
): PlanEdit {
  const leg = plan.legs[legIndex];
  if (!leg) {
    return { plan, reroute: [] };
  }
  const from = plan.waypoints[legIndex];
  const to = plan.waypoints[legIndex + 1];
  return {
    plan: {
      ...plan,
      legs: [
        ...plan.legs.slice(0, legIndex),
        straightLeg(from, point, leg.mode),
        straightLeg(point, to, leg.mode),
        ...plan.legs.slice(legIndex + 1),
      ],
      waypoints: [
        ...plan.waypoints.slice(0, legIndex + 1),
        point,
        ...plan.waypoints.slice(legIndex + 1),
      ],
    },
    reroute: [legIndex, legIndex + 1],
  };
}

export function moveWaypoint(
  plan: RoutePlan,
  index: number,
  point: Position,
): PlanEdit {
  if (!plan.waypoints[index]) {
    return { plan, reroute: [] };
  }
  const waypoints = plan.waypoints.map((existing, i) =>
    i === index ? point : existing,
  );
  const legs = [...plan.legs];
  const reroute: number[] = [];
  for (const legIndex of [index - 1, index]) {
    const leg = legs[legIndex];
    if (leg) {
      legs[legIndex] = straightLeg(
        waypoints[legIndex],
        waypoints[legIndex + 1],
        leg.mode,
      );
      reroute.push(legIndex);
    }
  }
  return { plan: { ...plan, legs, waypoints }, reroute };
}

/**
 * Removes a waypoint. In the middle of the route its two legs become one,
 * routed afresh between the neighbours; at either end its leg simply goes.
 */
export function removeWaypoint(plan: RoutePlan, index: number): PlanEdit {
  const count = plan.waypoints.length;
  if (index < 0 || index >= count) {
    return { plan, reroute: [] };
  }
  const waypoints = plan.waypoints.filter((_, i) => i !== index);
  if (index === 0 || index === count - 1) {
    const legs = index === 0 ? plan.legs.slice(1) : plan.legs.slice(0, -1);
    return { plan: { ...plan, legs, waypoints }, reroute: [] };
  }
  const mode = plan.legs[index - 1].mode;
  return {
    plan: {
      ...plan,
      legs: [
        ...plan.legs.slice(0, index - 1),
        straightLeg(waypoints[index - 1], waypoints[index], mode),
        ...plan.legs.slice(index + 1),
      ],
      waypoints,
    },
    reroute: [index - 1],
  };
}

/** Switches one leg between following the network and a straight line. */
export function setLegMode(
  plan: RoutePlan,
  legIndex: number,
  mode: LegMode,
): PlanEdit {
  if (!plan.legs[legIndex]) {
    return { plan, reroute: [] };
  }
  const legs = [...plan.legs];
  legs[legIndex] = straightLeg(
    plan.waypoints[legIndex],
    plan.waypoints[legIndex + 1],
    mode,
  );
  return {
    plan: { ...plan, legs },
    reroute: mode === 'network' ? [legIndex] : [],
  };
}

/** The same route ridden the other way. Nothing needs routing again. */
export function reversePlan(plan: RoutePlan): PlanEdit {
  return {
    plan: {
      ...plan,
      legs: [...plan.legs].reverse().map((leg) => ({
        ...leg,
        coordinates: [...leg.coordinates].reverse(),
        steps: [...leg.steps].reverse(),
      })),
      waypoints: [...plan.waypoints].reverse(),
    },
    reroute: [],
  };
}

/** Routes back to the start, making a loop. */
export function closeLoop(plan: RoutePlan): PlanEdit {
  const first = plan.waypoints[0];
  const last = plan.waypoints.at(-1);
  if (!first || !last || plan.waypoints.length < 2) {
    return { plan, reroute: [] };
  }
  if (first[0] === last[0] && first[1] === last[1]) {
    return { plan, reroute: [] };
  }
  return appendWaypoint(plan, first);
}

function isPosition(value: unknown): value is Position {
  if (!Array.isArray(value) || value.length < 2) {
    return false;
  }
  const [lng, lat] = value.map(Number);
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  );
}

function isStep(value: unknown): value is RouteStep {
  const step = value as { meters?: unknown; source?: { kind?: unknown } };
  return (
    typeof step?.meters === 'number' &&
    Number.isFinite(step.meters) &&
    typeof step.source?.kind === 'string' &&
    STEP_KINDS.has(step.source.kind as StepSource['kind'])
  );
}

const STEP_KINDS = new Set<StepSource['kind']>([
  'connector',
  'osm',
  'straight',
  'trail',
]);

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
