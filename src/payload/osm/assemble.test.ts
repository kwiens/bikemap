import { describe, it, expect } from 'vitest';
import { assembleWays, boundsOf, lengthMeters } from './assemble';
import type { OsmWay } from './overpass';

// Coordinates around Bend, spaced far enough apart to exceed the 12 m join
// tolerance so "joined" in these tests means genuinely joined.
function way(id: number, coordinates: [number, number][]): OsmWay {
  return { coordinates, id, tags: {} };
}

const A: [number, number] = [-121.4, 44.0];
const B: [number, number] = [-121.39, 44.01];
const C: [number, number] = [-121.38, 44.02];
const D: [number, number] = [-121.37, 44.03];
// Far away — can't join to anything above.
const FAR1: [number, number] = [-121.0, 44.5];
const FAR2: [number, number] = [-120.99, 44.51];

describe('assembleWays', () => {
  it('joins ways that meet end to start', () => {
    const result = assembleWays([
      way(1, [A, B]),
      way(2, [B, C]),
      way(3, [C, D]),
    ]);

    expect(result.parts).toHaveLength(1);
    expect(result.gaps).toEqual([]);
    // The shared node appears once, not twice per junction.
    expect(result.parts[0]).toEqual([A, B, C, D]);
    expect(result.orderedIds).toEqual([1, 2, 3]);
  });

  it('reverses a way that is stored backwards', () => {
    // OSM way direction is arbitrary — a trail is often mapped against the
    // direction you ride it.
    const result = assembleWays([way(1, [A, B]), way(2, [C, B])]);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual([A, B, C]);
  });

  it('joins a way that attaches to the head of the run', () => {
    const result = assembleWays([way(1, [B, C]), way(2, [A, B])]);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual([A, B, C]);
    expect(result.orderedIds).toEqual([2, 1]);
  });

  it('joins ways given out of order', () => {
    const result = assembleWays([
      way(3, [C, D]),
      way(1, [A, B]),
      way(2, [B, C]),
    ]);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual([A, B, C, D]);
  });

  it('keeps disconnected ways as separate parts instead of dropping them', () => {
    // The client-side stitcher discards leftovers. Here the curator needs to
    // see that the trail is in two pieces, and keep the geometry of both.
    const result = assembleWays([way(1, [A, B]), way(2, [FAR1, FAR2])]);

    expect(result.parts).toHaveLength(2);
    expect(result.orderedIds).toEqual([1, 2]);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].distanceMeters).toBeGreaterThan(1000);
  });

  it('reports the shortest hop between two disconnected parts', () => {
    // The gap should measure the closest pair of endpoints, since that's the
    // connector the curator is missing — not an arbitrary end-to-start pair.
    const near: [number, number] = [-121.3695, 44.0305];
    const result = assembleWays([way(1, [A, B, C, D]), way(2, [FAR1, near])]);

    expect(result.parts).toHaveLength(2);
    // D -> near is a few tens of meters; D -> FAR1 is tens of kilometers.
    expect(result.gaps[0].distanceMeters).toBeLessThan(100);
  });

  it('ignores ways with fewer than two positions', () => {
    const result = assembleWays([way(1, [A, B]), way(2, [C])]);

    expect(result.parts).toHaveLength(1);
    expect(result.orderedIds).toEqual([1]);
  });

  it('returns nothing for no ways', () => {
    expect(assembleWays([])).toEqual({ gaps: [], orderedIds: [], parts: [] });
  });
});

describe('lengthMeters', () => {
  it('sums along each part without counting the gaps between them', () => {
    // This is exactly the discrepancy found in the Bend data: a stored
    // distance that counts connector gaps reads longer than the geometry.
    const joined = lengthMeters([[A, B, C]]);
    const split = lengthMeters([
      [A, B],
      [B, C],
    ]);

    expect(split).toBeCloseTo(joined, 6);
  });

  it('is zero for an empty geometry', () => {
    expect(lengthMeters([])).toBe(0);
  });
});

describe('boundsOf', () => {
  it('covers every part', () => {
    const bounds = boundsOf([
      [A, B],
      [FAR1, FAR2],
    ]);

    expect(bounds).not.toBeNull();
    const [swLng, swLat, neLng, neLat] = bounds as [
      number,
      number,
      number,
      number,
    ];
    expect(swLng).toBeCloseTo(-121.4, 6);
    expect(swLat).toBeCloseTo(44.0, 6);
    expect(neLng).toBeCloseTo(-120.99, 6);
    expect(neLat).toBeCloseTo(44.51, 6);
  });

  it('is null when there is no geometry', () => {
    expect(boundsOf([])).toBeNull();
  });
});
