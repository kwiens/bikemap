import { describe, it, expect } from 'vitest';
import { MTB_SCALE_RATING } from './osm-trails';

describe('MTB_SCALE_RATING', () => {
  it('buckets mtb:scale tokens (incl. +/- refinements) into difficulty', () => {
    // The line color expression derives from this same map.
    expect(MTB_SCALE_RATING['0']).toBe('easy');
    expect(MTB_SCALE_RATING['1']).toBe('intermediate');
    expect(MTB_SCALE_RATING['3']).toBe('advanced');
    expect(MTB_SCALE_RATING['5']).toBe('expert');
    expect(MTB_SCALE_RATING['4+']).toBe('expert');
    expect(MTB_SCALE_RATING['2-']).toBe('advanced');
    expect(MTB_SCALE_RATING['0+']).toBe('easy');
    expect(MTB_SCALE_RATING.bogus).toBeUndefined();
  });
});
