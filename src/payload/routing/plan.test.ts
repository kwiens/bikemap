import { describe, expect, it } from 'vitest';
import { buildRouteGraph, type Position } from './graph';
import {
  appendWaypoint,
  closeLoop,
  EMPTY_PLAN,
  insertWaypoint,
  MAX_WAYPOINTS,
  moveWaypoint,
  parseRoutePlan,
  planGeometry,
  planMeters,
  planSteps,
  replacePendingLeg,
  type RoutePlan,
  removeWaypoint,
  reversePlan,
  setLegMode,
  straightLeg,
} from './plan';
import { routeLeg } from './router';

const at = (east: number, north: number): Position => [
  -121.3 + east * 0.001,
  44.05 + north * 0.001,
];

/** A plan through `points` with straight network placeholders. */
function planThrough(...points: Position[]): RoutePlan {
  return points.reduce<RoutePlan>(
    (plan, point) => appendWaypoint(plan, point).plan,
    EMPTY_PLAN,
  );
}

describe('parseRoutePlan', () => {
  it('reads empty values as an empty plan', () => {
    expect(parseRoutePlan(null)).toEqual({
      error: null,
      ok: true,
      plan: EMPTY_PLAN,
    });
  });

  it('round-trips a plan, including from a JSON string', () => {
    const plan = planThrough(at(0, 0), at(1, 0), at(1, 1));

    expect(parseRoutePlan(plan).plan).toEqual(plan);
    expect(parseRoutePlan(JSON.stringify(plan)).plan).toEqual(plan);
  });

  it('rejects a plan whose legs do not match its waypoints', () => {
    const plan = planThrough(at(0, 0), at(1, 0));
    const parsed = parseRoutePlan({ ...plan, legs: [] });

    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/must have 1 legs/);
  });

  it('rejects a leg detached from its waypoints', () => {
    const plan = planThrough(at(0, 0), at(1, 0), at(2, 0));
    const parsed = parseRoutePlan({
      ...plan,
      legs: [
        plan.legs[0],
        { ...plan.legs[1], coordinates: [at(3, 0), at(2, 0)] },
      ],
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/Leg 2 must start and end at its waypoints/);
  });

  it('rejects a plan from an unsupported version', () => {
    const plan = planThrough(at(0, 0), at(1, 0));

    expect(parseRoutePlan({ ...plan, version: 2 }).error).toMatch(
      /unsupported version/,
    );
  });

  it('rejects bad positions, modes, and oversized plans', () => {
    const plan = planThrough(at(0, 0), at(1, 0));

    expect(
      parseRoutePlan({
        ...plan,
        waypoints: [
          [0, 0],
          [200, 0],
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseRoutePlan({ ...plan, legs: [{ ...plan.legs[0], mode: 'fly' }] }).ok,
    ).toBe(false);
    expect(
      parseRoutePlan({
        legs: [],
        waypoints: Array.from({ length: MAX_WAYPOINTS + 1 }, () => at(0, 0)),
      }).ok,
    ).toBe(false);
  });

  it('drops malformed steps rather than failing the plan', () => {
    const plan = planThrough(at(0, 0), at(1, 0));
    const parsed = parseRoutePlan({
      ...plan,
      legs: [{ ...plan.legs[0], steps: [{ meters: 'far' }] }],
    });

    expect(parsed.ok && parsed.plan.legs[0].steps).toEqual([]);
  });
});

describe('planGeometry', () => {
  it('joins legs into one line, writing each waypoint once', () => {
    const plan = planThrough(at(0, 0), at(1, 0), at(1, 1));

    expect(planGeometry(plan)).toEqual({
      coordinates: [[at(0, 0), at(1, 0), at(1, 1)]],
      type: 'MultiLineString',
    });
  });

  it('is null until there is a leg', () => {
    expect(planGeometry(planThrough(at(0, 0)))).toBeNull();
  });
});

describe('edits', () => {
  it('does not apply a stale route after undo restores the same endpoints', () => {
    const pending = planThrough(at(0, 0), at(1, 0));
    const previous = {
      ...pending,
      legs: [straightLeg(at(0, 0), at(1, 0), 'straight')],
    };
    const routed = {
      ...pending.legs[0],
      isUnrouted: false,
    };

    expect(replacePendingLeg(previous, pending, 0, routed)).toBe(previous);
    expect(replacePendingLeg(pending, pending, 0, routed).legs[0]).toBe(routed);
  });

  it('appends a waypoint and asks for its leg to be routed', () => {
    const edit = appendWaypoint(planThrough(at(0, 0)), at(1, 0));

    expect(edit.plan.waypoints).toEqual([at(0, 0), at(1, 0)]);
    expect(edit.reroute).toEqual([0]);
  });

  it('inserts a waypoint into a leg, splitting it', () => {
    const edit = insertWaypoint(
      planThrough(at(0, 0), at(2, 0), at(2, 2)),
      0,
      at(1, 0),
    );

    expect(edit.plan.waypoints).toEqual([
      at(0, 0),
      at(1, 0),
      at(2, 0),
      at(2, 2),
    ]);
    expect(edit.plan.legs).toHaveLength(3);
    expect(edit.reroute).toEqual([0, 1]);
  });

  it('moves a waypoint and reroutes the legs on both sides', () => {
    const edit = moveWaypoint(
      planThrough(at(0, 0), at(1, 0), at(2, 0)),
      1,
      at(1, 1),
    );

    expect(edit.plan.legs[0].coordinates.at(-1)).toEqual(at(1, 1));
    expect(edit.plan.legs[1].coordinates[0]).toEqual(at(1, 1));
    expect(edit.reroute).toEqual([0, 1]);
  });

  it('removing a middle waypoint merges its two legs', () => {
    const edit = removeWaypoint(planThrough(at(0, 0), at(1, 0), at(2, 0)), 1);

    expect(edit.plan.waypoints).toEqual([at(0, 0), at(2, 0)]);
    expect(edit.plan.legs).toHaveLength(1);
    expect(edit.reroute).toEqual([0]);
  });

  it('removing an end waypoint drops its leg without rerouting', () => {
    const plan = planThrough(at(0, 0), at(1, 0), at(2, 0));

    expect(removeWaypoint(plan, 0).plan.waypoints).toEqual([
      at(1, 0),
      at(2, 0),
    ]);
    expect(removeWaypoint(plan, 2).plan.legs).toHaveLength(1);
    expect(removeWaypoint(plan, 2).reroute).toEqual([]);
  });

  it('switching a leg to straight needs no routing; back to network does', () => {
    const plan = planThrough(at(0, 0), at(1, 0));
    const straight = setLegMode(plan, 0, 'straight');

    expect(straight.plan.legs[0]).toMatchObject({ mode: 'straight' });
    expect(straight.plan.legs[0].isUnrouted).toBeUndefined();
    expect(straight.reroute).toEqual([]);
    expect(setLegMode(straight.plan, 0, 'network').reroute).toEqual([0]);
  });

  it('reverses waypoints, legs, and each leg’s line', () => {
    const plan = planThrough(at(0, 0), at(1, 0), at(1, 1));
    const reversed = reversePlan(plan).plan;

    expect(reversed.waypoints).toEqual([at(1, 1), at(1, 0), at(0, 0)]);
    expect(planGeometry(reversed)?.coordinates).toEqual([
      [at(1, 1), at(1, 0), at(0, 0)],
    ]);
  });

  it('closes a loop back to the start, once', () => {
    const loop = closeLoop(planThrough(at(0, 0), at(1, 0), at(1, 1))).plan;

    expect(loop.waypoints.at(-1)).toEqual(at(0, 0));
    expect(closeLoop(loop).plan).toBe(loop);
  });
});

describe('routeLeg', () => {
  const graph = buildRouteGraph({
    trails: [],
    ways: [
      {
        class: 'cycleway',
        coordinates: [at(0, 0), at(1, 0), at(1, 1)],
        hasBikeLane: false,
        id: 1,
        name: 'Deschutes River Trail',
        nodes: [1, 2, 3],
      },
    ],
  });

  it('follows the network and starts and ends on the waypoints', () => {
    const leg = routeLeg(graph, at(0.5, 0), at(1, 0.5), 'network');

    expect(leg.coordinates).toEqual([at(0.5, 0), at(1, 0), at(1, 0.5)]);
    expect(leg.isUnrouted).toBeUndefined();
    expect(planSteps({ legs: [leg], version: 1, waypoints: [] })).toEqual([
      {
        meters: expect.closeTo(96, -1),
        source: expect.objectContaining({ name: 'Deschutes River Trail' }),
      },
    ]);
  });

  it('reaches a waypoint off the network with a straight approach', () => {
    // ~144 m south of the path's first segment: past the snap radius, within
    // reach of a straight approach.
    const leg = routeLeg(graph, at(0.5, -1.3), at(1, 0.5), 'network');

    expect(leg.isUnrouted).toBeUndefined();
    expect(leg.coordinates[0]).toEqual(at(0.5, -1.3));
    expect(leg.coordinates[1][0]).toBeCloseTo(at(0.5, 0)[0], 6);
    expect(leg.coordinates[1][1]).toBeCloseTo(at(0.5, 0)[1], 6);
    expect(leg.steps[0]).toEqual({
      meters: expect.closeTo(144, -1),
      source: { kind: 'straight' },
    });
    expect(leg.steps[1].source).toMatchObject({ kind: 'osm' });
  });

  it('falls back to a flagged straight line when nothing connects', () => {
    const leg = routeLeg(graph, at(0, 0), at(5, 5), 'network');

    expect(leg).toEqual(straightLeg(at(0, 0), at(5, 5), 'network'));
    expect(leg.isUnrouted).toBe(true);
  });

  it('measures a plan from its legs', () => {
    const plan = planThrough(at(0, 0), at(1, 0));
    expect(planMeters(plan)).toBeCloseTo(80, -1);
  });
});
