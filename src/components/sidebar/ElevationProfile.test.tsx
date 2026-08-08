import { describe, it, expect } from 'vitest';
import {
  gradeToColor,
  computeGradeColors,
  computeGrades,
  downsampleStops,
  formatGrade,
  MAX_GRADIENT_STOPS,
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

  it('caps the stop count on a profile longer than the cap', () => {
    const points = makePoints(MAX_GRADIENT_STOPS + 100);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops).toHaveLength(MAX_GRADIENT_STOPS);
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

describe('computeGrades', () => {
  // 10 ft up over 100 ft along = 10%.
  const climb: [number, number, number, number][] = [
    [0, 100, -85, 35],
    [100, 110, -85, 35],
    [200, 120, -85, 35],
    [300, 130, -85, 35],
    [400, 140, -85, 35],
  ];

  it('reads a steady grade correctly', () => {
    const grades = computeGrades(climb);
    // The interior points have a full window either side, so they land on 10.
    expect(grades[2]).toBeCloseTo(10, 5);
  });

  it('signs a descent negative', () => {
    const drop: [number, number, number, number][] = climb.map(
      ([d, e, lng, lat]) => [d, 200 - e, lng, lat],
    );
    expect(computeGrades(drop)[2]).toBeCloseTo(-10, 5);
  });

  it('keeps a short pitch visible rather than averaging it away', () => {
    // One steep step in otherwise flat ground. With the old ±2 window this
    // was divided across five samples; the point of the smaller window is
    // that the pitch still reads as steep.
    const pitch: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 100, -85, 35],
      [200, 130, -85, 35],
      [300, 130, -85, 35],
      [400, 130, -85, 35],
    ];
    expect(Math.max(...computeGrades(pitch))).toBeGreaterThan(9);
  });

  it('is one grade per point, and flat for a degenerate profile', () => {
    expect(computeGrades(climb)).toHaveLength(climb.length);
    expect(computeGrades([[0, 100, -85, 35]])).toEqual([0]);
    expect(computeGrades([])).toEqual([]);
  });
});

describe('formatGrade', () => {
  it('signs the number, because up and down share a colour', () => {
    expect(formatGrade(8.42)).toBe('+8.4%');
    expect(formatGrade(-8.42)).toBe('−8.4%');
  });

  it('does not dress up a zero', () => {
    expect(formatGrade(0)).toBe('0.0%');
    expect(formatGrade(0.01)).toBe('0.0%');
  });

  it('degrades rather than printing NaN', () => {
    expect(formatGrade(undefined)).toBe('—');
    expect(formatGrade(Number.NaN)).toBe('—');
  });
});
