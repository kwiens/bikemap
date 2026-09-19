import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ElevationProfile,
  slugForTrail,
} from '@/data/mountain-bike-trails';
import { chattanoogaData } from './index';
import { getChattanoogaMeasurement } from './measurements';

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

const mountainBikeTrails = chattanoogaData.mountainBikeTrails;

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

  it('keeps imported geometry, summaries, and static profiles in sync', () => {
    const byName = new Map(
      collection.features.map((feature) => [feature.properties.Trail, feature]),
    );
    const matched = mountainBikeTrails.filter((trail) =>
      byName.has(trail.trailName),
    );

    expect(matched).toHaveLength(218);
    for (const trail of matched) {
      const measurement = getChattanoogaMeasurement(trail.trailName);
      expect(measurement).toBeDefined();
      expect(trail).toEqual(expect.objectContaining(measurement));

      const profile = JSON.parse(
        readFileSync(
          path.join(
            process.cwd(),
            'public/data/elevation/chattanooga',
            `${slugForTrail(trail)}.json`,
          ),
          'utf8',
        ),
      ) as ElevationProfile;

      const feature = byName.get(trail.trailName);
      expect(profile.profile.length).toBeGreaterThan(1);
      expect(profile.segmentStarts ?? []).toHaveLength(
        Math.max(0, (feature?.geometry.coordinates.length ?? 0) - 1),
      );
      expect(Number((profile.distance / 5280).toFixed(2))).toBe(
        measurement?.distance,
      );
      expect(Math.round(profile.gain)).toBe(measurement?.elevationGain);
      expect(Math.round(profile.loss)).toBe(measurement?.elevationLoss);
      expect(Math.round(profile.max)).toBe(measurement?.elevationMax);
      expect(Math.round(profile.min)).toBe(measurement?.elevationMin);

      const profileCoordinates = new Set(
        profile.profile.map(
          ([, , longitude, latitude]) => `${longitude},${latitude}`,
        ),
      );
      for (const part of feature?.geometry.coordinates ?? []) {
        const first = part[0];
        const last = part[part.length - 1];
        expect(profileCoordinates.has(`${first[0]},${first[1]}`)).toBe(true);
        expect(profileCoordinates.has(`${last[0]},${last[1]}`)).toBe(true);
      }
    }

    expect(
      getChattanoogaMeasurement('Spur and Connector Trails')?.distance,
    ).toBe(0.49);
  });
});
