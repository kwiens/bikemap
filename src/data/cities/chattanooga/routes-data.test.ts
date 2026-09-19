import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface RouteFeature {
  geometry: {
    coordinates: [number, number][][];
    type: 'MultiLineString';
  };
  properties: { id: string; sourceFeatureCount: number };
  type: 'Feature';
}

const collection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'public/data/chattanooga/routes.geojson'),
    'utf8',
  ),
) as { features: RouteFeature[]; type: 'FeatureCollection' };

describe('Chattanooga route import geometry', () => {
  it('provides valid WGS84 geometry for every configured route', () => {
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features.map((feature) => feature.properties.id)).toEqual(
      ['riverwalk-loop-v3-public'],
    );

    for (const feature of collection.features) {
      expect(feature.geometry.type).toBe('MultiLineString');
      expect(feature.properties.sourceFeatureCount).toBeGreaterThan(0);
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
