import { describe, it, expect } from 'vitest';
import { MTB_SCALE_RATING, osmTrailDetails } from './osm-trails';

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

describe('osmTrailDetails', () => {
  it('extracts a focused, labeled tag summary + OSM link', () => {
    expect(
      osmTrailDetails({
        highway: 'cycleway',
        surface: 'natural_ground',
        bicycle: 'designated',
        'mtb:scale': '3',
        OSM_ID: '12345',
        OSM_TYPE: 'way',
      }),
    ).toEqual({
      type: 'Cycleway',
      surface: 'Natural Ground',
      bikes: 'Designated',
      difficulty: 'advanced',
      url: 'https://www.openstreetmap.org/way/12345',
    });
  });

  it('leaves missing tags undefined', () => {
    expect(osmTrailDetails({ highway: 'path' })).toEqual({
      type: 'Path',
      surface: undefined,
      bikes: undefined,
      difficulty: undefined,
      url: undefined,
    });
  });
});
