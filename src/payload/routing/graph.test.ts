import { describe, expect, it } from 'vitest';
import {
  appendStep,
  buildRouteGraph,
  type CuratedTrail,
  type NetworkWay,
  type Position,
  type RouteStep,
  routeBetween,
  snapToGraph,
} from './graph';

// Near Bend. 0.001° of longitude is ~80 m here, 0.001° of latitude ~111 m.
const LNG = -121.3;
const LAT = 44.05;
const at = (east: number, north: number): Position => [
  LNG + east * 0.001,
  LAT + north * 0.001,
];

function way(
  id: number,
  nodes: number[],
  points: Position[],
  overrides: Partial<NetworkWay> = {},
): NetworkWay {
  return {
    class: 'street',
    coordinates: points,
    hasBikeLane: false,
    id,
    name: `Way ${id}`,
    nodes,
    ...overrides,
  };
}

function route(
  ways: NetworkWay[],
  from: Position,
  to: Position,
  trails: CuratedTrail[] = [],
) {
  const graph = buildRouteGraph({ trails, ways });
  const a = snapToGraph(graph, from);
  const b = snapToGraph(graph, to);
  if (!a || !b) {
    throw new Error('did not snap');
  }
  return routeBetween(graph, a, b);
}

const names = (steps: RouteStep[]) =>
  steps.map((step) =>
    step.source.kind === 'osm' || step.source.kind === 'trail'
      ? step.source.name
      : step.source.kind,
  );

describe('routeBetween', () => {
  it('follows ways that share a node', () => {
    const result = route(
      [
        way(1, [1, 2], [at(0, 0), at(1, 0)]),
        way(2, [2, 3], [at(1, 0), at(1, 1)]),
      ],
      at(0, 0),
      at(1, 1),
    );

    expect(result?.coordinates).toEqual([at(0, 0), at(1, 0), at(1, 1)]);
    expect(names(result?.steps ?? [])).toEqual(['Way 1', 'Way 2']);
  });

  it('takes only the stretch between two points on one long way', () => {
    const result = route(
      [way(1, [1, 2, 3, 4], [at(0, 0), at(1, 0), at(2, 0), at(3, 0)])],
      at(0.5, 0.0001),
      at(2.5, 0.0001),
    );

    const [start] = result?.coordinates ?? [];
    const end = result?.coordinates.at(-1);
    expect(start?.[0]).toBeCloseTo(at(0.5, 0)[0], 7);
    expect(end?.[0]).toBeCloseTo(at(2.5, 0)[0], 7);
    expect(result?.coordinates).toHaveLength(4);
    // Two of the three 80 m segments.
    expect(result?.steps[0].meters).toBeCloseTo(160, -1);
  });

  it('prefers a curated trail over a busier road that is a little shorter', () => {
    // Road: straight across. Trail: a shallow detour north, 1.15× longer.
    const result = route(
      [
        way(1, [1, 2], [at(0, 0), at(4, 0)], {
          class: 'primary',
          name: 'Highway',
        }),
      ],
      at(0, 0),
      at(4, 0),
      [
        {
          name: 'River Trail',
          parts: [[at(0, 0.0005), at(2, 1), at(4, 0.0005)]],
          slug: 'river-trail',
        },
      ],
    );

    expect(names(result?.steps ?? [])).toContain('River Trail');
    expect(names(result?.steps ?? [])).not.toContain('Highway');
  });

  it('still uses a primary road when it is the only connection', () => {
    const result = route(
      [way(1, [1, 2], [at(0, 0), at(4, 0)], { class: 'primary' })],
      at(0, 0),
      at(4, 0),
    );

    expect(result).not.toBeNull();
  });

  it('stitches a trail that ends a few meters from a road', () => {
    // The trail ends ~6 m south of the road's middle; no shared node.
    const result = route(
      [way(1, [1, 2], [at(0, 0), at(4, 0)], { name: 'Main St' })],
      at(0, 0),
      at(2, -2),
      [
        {
          name: 'Spur',
          parts: [[at(2, -0.055), at(2, -2)]],
          slug: 'spur',
        },
      ],
    );

    expect(names(result?.steps ?? [])).toEqual(['Main St', 'Spur']);
  });

  it('connects a loop trail whose two ends meet each other', () => {
    // The loop's ends are a meter apart and stitch to each other — which must
    // not stop them also joining the road ~6 m away.
    const result = route(
      [way(1, [1, 2], [at(0, 0), at(4, 0)], { name: 'Main St' })],
      at(0, 0),
      at(3, -1),
      [
        {
          name: 'Loop',
          parts: [[at(2, -0.055), at(3, -1), at(1, -1), at(2.01, -0.06)]],
          slug: 'loop',
        },
      ],
    );

    expect(names(result?.steps ?? [])).toEqual(['Main St', 'Loop']);
  });

  it('joins a trail to a road it crosses at a shared vertex', () => {
    const result = route(
      [way(1, [1, 2, 3], [at(0, 0), at(2, 0), at(4, 0)], { name: 'Main St' })],
      at(0, 0),
      at(2, -2),
      [
        {
          name: 'Crossing',
          parts: [[at(2, 2), at(2, 0.00002), at(2, -2)]],
          slug: 'crossing',
        },
      ],
    );

    expect(names(result?.steps ?? [])).toEqual(['Main St', 'Crossing']);
  });

  it('does not stitch lines that are merely nearby', () => {
    // ~33 m apart — further than any plausible data gap.
    const graph = buildRouteGraph({
      trails: [
        { name: 'Spur', parts: [[at(2, -0.3), at(2, -2)]], slug: 'spur' },
      ],
      ways: [way(1, [1, 2], [at(0, 0), at(4, 0)])],
    });
    const a = snapToGraph(graph, at(0, 0));
    const b = snapToGraph(graph, at(2, -2));

    expect(a && b && routeBetween(graph, a, b)).toBeNull();
  });
});

describe('snapToGraph', () => {
  it('snaps within range and refuses beyond it', () => {
    const graph = buildRouteGraph({
      trails: [],
      ways: [way(1, [1, 2], [at(0, 0), at(4, 0)])],
    });

    expect(snapToGraph(graph, at(2, 0.3))?.distanceMeters).toBeCloseTo(33, 0);
    expect(snapToGraph(graph, at(2, 1))).toBeNull();
  });
});

describe('snapToGraph trail preference', () => {
  const graph = buildRouteGraph({
    trails: [
      { name: 'Ridge', parts: [[at(0, 0.05), at(4, 0.05)]], slug: 'ridge' },
    ],
    ways: [way(1, [1, 2], [at(0, 0), at(4, 0)], { class: 'path' })],
  });

  it('prefers a curated trail a few meters further than an OSM line', () => {
    // ~2 m from the OSM path, ~3.5 m from the trail.
    const snap = snapToGraph(graph, at(2, 0.018));
    expect(graph.sources[snap?.source ?? -1]).toMatchObject({ kind: 'trail' });
  });

  it('takes the nearer line when the trail is well beyond the preference', () => {
    const farTrail = buildRouteGraph({
      trails: [
        { name: 'Ridge', parts: [[at(0, 0.3), at(4, 0.3)]], slug: 'ridge' },
      ],
      ways: [way(1, [1, 2], [at(0, 0), at(4, 0)], { class: 'path' })],
    });
    const snap = snapToGraph(farTrail, at(2, 0.01));
    expect(farTrail.sources[snap?.source ?? -1]).toMatchObject({ kind: 'osm' });
  });
});

describe('appendStep', () => {
  it('merges consecutive ways with the same name and folds connectors', () => {
    const steps: RouteStep[] = [];
    const street = (id: number) =>
      ({ class: 'street', id, kind: 'osm', name: 'Main St' }) as const;
    appendStep(steps, 100, street(1));
    appendStep(steps, 50, street(2));
    appendStep(steps, 5, { kind: 'connector' });
    appendStep(steps, 200, { kind: 'trail', name: 'Spur', slug: 'spur' });

    expect(steps).toEqual([
      { meters: 155, source: street(1) },
      { meters: 200, source: { kind: 'trail', name: 'Spur', slug: 'spur' } },
    ]);
  });
});
