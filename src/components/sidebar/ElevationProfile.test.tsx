import { describe, it, expect } from 'vitest';
import {
  gradeToColor,
  computeGradeColors,
  downsampleStops,
  findClosestProfileIndex,
  profilePointToXY,
} from './ElevationProfile';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';

describe('gradeToColor', () => {
  it('returns green for grade 0', () => {
    expect(gradeToColor(0)).toBe('rgb(34,197,94)');
  });

  it('returns a yellow-ish color for grade 12', () => {
    const color = gradeToColor(12);
    expect(color).toBe('rgb(234,179,8)');
  });

  it('returns a red-ish color for grade 25', () => {
    const color = gradeToColor(25);
    expect(color).toBe('rgb(239,0,68)');
  });

  it('uses absolute value so negative grades match positive', () => {
    expect(gradeToColor(-12)).toBe(gradeToColor(12));
  });

  it('clamps grades above 25 to the max color', () => {
    expect(gradeToColor(50)).toBe(gradeToColor(25));
  });
});

describe('computeGradeColors', () => {
  it('returns empty array for 0 points', () => {
    expect(computeGradeColors([])).toEqual([]);
  });

  it('returns single green entry for 1 point', () => {
    const result = computeGradeColors([[0, 100, -85, 35]]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('rgb(34,197,94)');
  });

  it('returns array same length as input', () => {
    const points: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 110, -85.001, 35.001],
      [200, 130, -85.002, 35.002],
      [300, 120, -85.003, 35.003],
      [400, 150, -85.004, 35.004],
    ];
    const result = computeGradeColors(points);
    expect(result).toHaveLength(points.length);
  });

  it('returns all valid rgb() strings', () => {
    const points: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 120, -85.001, 35.001],
      [200, 110, -85.002, 35.002],
    ];
    const result = computeGradeColors(points);
    for (const color of result) {
      expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });
});

describe('downsampleStops', () => {
  function makePoints(n: number): [number, number, number, number][] {
    return Array.from({ length: n }, (_, i) => [
      i * 10,
      100 + i,
      -85 + i * 0.001,
      35 + i * 0.001,
    ]) as [number, number, number, number][];
  }

  it('returns all points when count is <= 200', () => {
    const points = makePoints(50);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops).toHaveLength(50);
  });

  it('returns exactly 200 stops when count is > 200', () => {
    const points = makePoints(500);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops).toHaveLength(200);
  });

  it('first offset is 0 and last is approximately 1', () => {
    const points = makePoints(500);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].offset).toBeCloseTo(1, 2);
  });
});

describe('findClosestProfileIndex', () => {
  const points: [number, number, number, number][] = [
    [0, 100, -85.3, 35.0],
    [100, 110, -85.301, 35.001],
    [200, 120, -85.302, 35.002],
    [300, 130, -85.303, 35.003],
  ];

  it('returns null for empty array', () => {
    expect(findClosestProfileIndex([], -85.3, 35.0)).toBeNull();
  });

  it('returns index of closest point', () => {
    expect(findClosestProfileIndex(points, -85.302, 35.002)).toBe(2);
  });

  it('returns first point when location is at start', () => {
    expect(findClosestProfileIndex(points, -85.3, 35.0)).toBe(0);
  });

  it('returns null when location is too far from trail', () => {
    // ~1 degree away, well beyond 0.002 threshold
    expect(findClosestProfileIndex(points, -86.0, 36.0)).toBeNull();
  });

  it('returns closest even when between two points', () => {
    // Between point 1 and point 2
    const idx = findClosestProfileIndex(points, -85.3015, 35.0015);
    expect(idx).toBe(1);
  });
});

describe('profilePointToXY', () => {
  const points: [number, number, number, number][] = [
    [0, 100, -85.3, 35.0],
    [500, 150, -85.301, 35.001],
    [1000, 200, -85.302, 35.002],
  ];
  const profile: ElevationProfileData = {
    trail: 'Test',
    distance: 1000,
    gain: 100,
    loss: 0,
    min: 100,
    max: 200,
    profile: points,
  };

  it('returns x proportional to distance', () => {
    const { x } = profilePointToXY(points, 0, profile, 800);
    expect(x).toBe(0);

    const { x: xMid } = profilePointToXY(points, 1, profile, 800);
    expect(xMid).toBe(400);

    const { x: xEnd } = profilePointToXY(points, 2, profile, 800);
    expect(xEnd).toBe(800);
  });

  it('returns y inverted (higher elevation = lower y)', () => {
    const { y: yLow } = profilePointToXY(points, 0, profile, 800);
    const { y: yHigh } = profilePointToXY(points, 2, profile, 800);
    expect(yHigh).toBeLessThan(yLow);
  });

  it('handles min === max (yRange defaults to 1)', () => {
    const flatProfile: ElevationProfileData = {
      ...profile,
      min: 100,
      max: 100,
    };
    const { y } = profilePointToXY(points, 0, flatProfile, 800);
    expect(Number.isFinite(y)).toBe(true);
  });
});
