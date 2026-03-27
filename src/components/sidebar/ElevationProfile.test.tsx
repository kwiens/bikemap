import { describe, it, expect } from 'vitest';
import { slugify } from '@/utils/string';
import {
  gradeToColor,
  computeGradeColors,
  downsampleStops,
} from './ElevationProfile';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Big Forest')).toBe('big-forest');
  });

  it('strips apostrophes', () => {
    expect(slugify("Stringer's Ridge")).toBe('stringers-ridge');
  });

  it('replaces slashes with dashes and collapses them', () => {
    expect(slugify('Access Road / Old RR Grade')).toBe(
      'access-road-old-rr-grade',
    );
  });

  it('replaces ampersands with dashes', () => {
    expect(slugify('Trail & Other')).toBe('trail-other');
  });

  it('collapses multiple spaces and dashes', () => {
    expect(slugify('foo   bar--baz')).toBe('foo-bar-baz');
  });
});

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
