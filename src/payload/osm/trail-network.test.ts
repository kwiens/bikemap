import { describe, expect, it } from 'vitest';
import {
  addWays,
  cellBounds,
  cellsCovering,
  createTrailNetwork,
  type NetworkWay,
  routeBetween,
  snapToNetwork,
} from './trail-network';

/**
 * A small network shaped like a trail junction:
 *
 *        3
 *        |
 *   1 -- 2 -- 4        5 -- 6   (5–6 is disconnected)
 *
 * Ways A (1-2-4) and B (2-3) share node 2. A long loop way C (1-7-4) offers a
 * detour so shortest-path choice is actually tested.
 */
const STEP = 0.001;
const node = (x: number, y: number): [number, number] => [
  -121.3 + x * STEP,
  44.0 + y * STEP,
];
const WAYS: NetworkWay[] = [
  {
    coordinates: [node(0, 0), node(1, 0), node(2, 0)],
    id: 100,
    name: 'A',
    nodes: [1, 2, 4],
  },
  {
    coordinates: [node(1, 0), node(1, 1)],
    id: 200,
    name: 'B',
    nodes: [2, 3],
  },
  {
    coordinates: [node(0, 0), node(1, -3), node(2, 0)],
    id: 300,
    name: 'C',
    nodes: [1, 7, 4],
  },
  {
    coordinates: [node(5, 0), node(6, 0)],
    id: 400,
    name: 'D',
    nodes: [5, 6],
  },
];

function network() {
  const built = createTrailNetwork();
  addWays(built, WAYS);
  return built;
}

describe('addWays', () => {
  it('joins ways at shared node ids', () => {
    const built = network();
    expect(
      built.edges
        .get(2)
        ?.map((edge) => edge.to)
        .sort(),
    ).toEqual([1, 3, 4]);
  });

  it('ignores a way it already has, so overlapping cells build the same graph', () => {
    const built = network();
    const segments = built.segments.length;
    addWays(built, WAYS);
    expect(built.segments).toHaveLength(segments);
  });

  it('skips a way whose nodes and coordinates disagree', () => {
    const built = createTrailNetwork();
    addWays(built, [
      { coordinates: [node(0, 0)], id: 1, name: null, nodes: [1, 2] },
    ]);
    expect(built.segments).toHaveLength(0);
  });
});

describe('snapToNetwork', () => {
  it('lands part-way along the nearest segment', () => {
    const snap = snapToNetwork(network(), node(0.5, 0.1));
    expect(snap).not.toBeNull();
    expect(snap?.point[0]).toBeCloseTo(node(0.5, 0)[0], 9);
    expect(snap?.point[1]).toBeCloseTo(node(0.5, 0)[1], 9);
    expect([snap?.from, snap?.to].sort()).toEqual([1, 2]);
  });

  it('finds the middle of a segment far longer than one index cell', () => {
    const built = createTrailNetwork();
    addWays(built, [
      {
        coordinates: [node(0, 0), node(20, 0)],
        id: 1,
        name: null,
        nodes: [1, 2],
      },
    ]);
    expect(snapToNetwork(built, node(10, 0.1))?.point[0]).toBeCloseTo(
      node(10, 0)[0],
      9,
    );
  });

  it('returns null beyond the snapping distance', () => {
    expect(snapToNetwork(network(), node(0.5, 5), 50)).toBeNull();
  });
});

describe('routeBetween', () => {
  it('follows the junction rather than a straight line', () => {
    const built = network();
    const from = snapToNetwork(built, node(0, 0.1));
    const to = snapToNetwork(built, node(1.1, 1));
    const route = routeBetween(built, from!, to!);
    // Start, through junction node 2, up B to the end.
    expect(route).toContainEqual(node(1, 0));
    expect(route?.[0]).toEqual(from!.point);
    expect(route?.at(-1)).toEqual(to!.point);
  });

  it('takes the shorter of two connections', () => {
    const built = network();
    const route = routeBetween(
      built,
      snapToNetwork(built, node(0.2, 0))!,
      snapToNetwork(built, node(1.8, 0))!,
    );
    expect(route).not.toContainEqual(node(1, -3));
  });

  it('runs straight along a single shared segment', () => {
    const built = network();
    const route = routeBetween(
      built,
      snapToNetwork(built, node(0.2, 0))!,
      snapToNetwork(built, node(0.8, 0))!,
    );
    expect(route).toHaveLength(2);
  });

  it('returns null when no trail connects the points', () => {
    const built = network();
    expect(
      routeBetween(
        built,
        snapToNetwork(built, node(0.5, 0))!,
        snapToNetwork(built, node(5.5, 0))!,
      ),
    ).toBeNull();
  });
});

describe('grid cells', () => {
  it('covers a box with every cell it touches', () => {
    expect(cellsCovering([-121.38, 44.01, -121.32, 44.06])).toEqual([
      '-1214:440',
    ]);
    expect(cellsCovering([-121.38, 44.01, -121.32, 44.16])).toHaveLength(2);
  });

  it('rounds a cell back to stable bounds', () => {
    expect(cellBounds('-1214:440')).toEqual([-121.4, 44, -121.3, 44.1]);
  });
});
