import { describe, it, expect } from 'vitest';
import { regionFor, mountainBikeTrails } from './mountain-bike-trails';

describe('regionFor', () => {
  it('maps 5 Points to Lookout Mountain', () => {
    expect(regionFor('5 Points')).toBe('Lookout Mountain');
  });

  it('maps Raccoon Mountain to Raccoon Mountain', () => {
    expect(regionFor('Raccoon Mountain')).toBe('Raccoon Mountain');
  });

  it('maps Stringers Ridge to North Shore & Red Bank', () => {
    expect(regionFor('Stringers Ridge')).toBe('North Shore & Red Bank');
  });

  it('maps White Oak Mountain to East Chattanooga', () => {
    expect(regionFor('White Oak Mountain')).toBe('East Chattanooga');
  });

  it('maps Chattanooga Greenways to Urban Chattanooga', () => {
    expect(regionFor('Chattanooga Greenways')).toBe('Urban Chattanooga');
  });

  it('returns Other for unknown areas', () => {
    expect(regionFor('Unknown Area')).toBe('Other');
  });

  it('returns Other for empty string', () => {
    expect(regionFor('')).toBe('Other');
  });
});

describe('mountainBikeTrails data integrity', () => {
  it('has trails', () => {
    expect(mountainBikeTrails.length).toBeGreaterThan(0);
  });

  it('every trail has required fields', () => {
    for (const trail of mountainBikeTrails) {
      expect(trail.trailName).toBeTruthy();
      expect(trail.displayName).toBeTruthy();
      expect(trail.recArea).toBeTruthy();
      expect(trail.color).toBeTruthy();
      expect(trail.icon).toBeDefined();
    }
  });

  it('every trail color is a valid hex color', () => {
    for (const trail of mountainBikeTrails) {
      expect(trail.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('every defaultBounds has exactly 4 numbers', () => {
    for (const trail of mountainBikeTrails) {
      if (trail.defaultBounds) {
        expect(trail.defaultBounds).toHaveLength(4);
        for (const val of trail.defaultBounds) {
          expect(typeof val).toBe('number');
          expect(Number.isFinite(val)).toBe(true);
        }
      }
    }
  });

  it('every recArea maps to a known region', () => {
    const unknownAreas = mountainBikeTrails
      .filter((t) => regionFor(t.recArea) === 'Other')
      .map((t) => t.recArea);
    expect(unknownAreas).toEqual([]);
  });

  it('distance and elevationGain are positive when present', () => {
    for (const trail of mountainBikeTrails) {
      if (trail.distance !== undefined) {
        expect(trail.distance).toBeGreaterThanOrEqual(0);
      }
      if (trail.elevationGain !== undefined) {
        expect(trail.elevationGain).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
