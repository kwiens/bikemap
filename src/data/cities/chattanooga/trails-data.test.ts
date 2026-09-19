import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountainBikeTrails } from '@/data/mountain-bike-trails';

interface TrailFeature {
  geometry: {
    coordinates: [number, number][][];
    type: 'MultiLineString';
  };
  properties: { Trail: string };
  type: 'Feature';
}

const collection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'public/data/chattanooga/trails.geojson'),
    'utf8',
  ),
) as { features: TrailFeature[]; type: 'FeatureCollection' };

describe('Chattanooga trail import geometry', () => {
  it('provides valid WGS84 MultiLineStrings for 218 curated trails', () => {
    const byName = new Map(
      collection.features.map((feature) => [feature.properties.Trail, feature]),
    );
    const matched = mountainBikeTrails.filter((trail) =>
      byName.has(trail.trailName),
    );
    const missing = mountainBikeTrails
      .filter((trail) => !byName.has(trail.trailName))
      .map((trail) => trail.trailName)
      .sort();

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(224);
    expect(
      collection.features.reduce(
        (count, feature) => count + feature.geometry.coordinates.length,
        0,
      ),
    ).toBe(397);
    expect(matched).toHaveLength(218);
    expect(missing).toEqual([
      'Godsey Ridge Blue 1',
      'Godsey Ridge Blue 2',
      'Godsey Ridge Expert 1',
      'Godsey Ridge Expert 2',
      'Godsey Ridge Expert Spur',
      'Godsey Ridge Green',
    ]);

    for (const feature of collection.features) {
      expect(feature.geometry.type).toBe('MultiLineString');
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
      for (const part of feature.geometry.coordinates) {
        expect(part.length).toBeGreaterThanOrEqual(2);
        for (const [longitude, latitude] of part) {
          expect(longitude).toBeGreaterThanOrEqual(-86);
          expect(longitude).toBeLessThanOrEqual(-84);
          expect(latitude).toBeGreaterThanOrEqual(34);
          expect(latitude).toBeLessThanOrEqual(36);
        }
      }
    }
  });
});
