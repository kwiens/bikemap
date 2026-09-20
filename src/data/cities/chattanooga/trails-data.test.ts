import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ElevationProfile,
  slugForTrail,
} from '@/data/mountain-bike-trails';
import { parseElevationProfile } from '@/utils/elevation-profile';
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
  it('provides an importable static elevation profile for every curated trail', () => {
    const missing: string[] = [];

    for (const trail of mountainBikeTrails) {
      const file = path.join(
        process.cwd(),
        'public/data/elevation/chattanooga',
        `${slugForTrail(trail)}.json`,
      );
      let profile: ElevationProfile | null;
      try {
        profile = parseElevationProfile(JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        missing.push(trail.trailName);
        continue;
      }

      if (!profile) {
        missing.push(trail.trailName);
        continue;
      }

      expect(profile.profile.length, trail.trailName).toBeGreaterThan(1);
      expect(profile.distance, trail.trailName).toBeGreaterThan(0);
      expect(Number.isFinite(profile.gain), trail.trailName).toBe(true);
      expect(Number.isFinite(profile.loss), trail.trailName).toBe(true);
      expect(Number.isFinite(profile.min), trail.trailName).toBe(true);
      expect(Number.isFinite(profile.max), trail.trailName).toBe(true);
    }

    expect(missing).toEqual([]);
    expect(mountainBikeTrails).toHaveLength(224);
  });

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

    const invalidGeometry: string[] = [];
    const invalidCoordinates: {
      coordinate: [number, number];
      trail: string;
    }[] = [];

    for (const feature of collection.features) {
      if (
        feature.geometry.type !== 'MultiLineString' ||
        feature.geometry.coordinates.length === 0
      ) {
        invalidGeometry.push(feature.properties.Trail);
      }
      for (const part of feature.geometry.coordinates) {
        if (part.length < 2) {
          invalidGeometry.push(feature.properties.Trail);
        }
        for (const [longitude, latitude] of part) {
          if (
            (longitude < -86 ||
              longitude > -84 ||
              latitude < 34 ||
              latitude > 36) &&
            invalidCoordinates.length < 20
          ) {
            invalidCoordinates.push({
              coordinate: [longitude, latitude],
              trail: feature.properties.Trail,
            });
          }
        }
      }
    }

    expect(invalidGeometry).toEqual([]);
    expect(invalidCoordinates).toEqual([]);
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

      const profile = parseElevationProfile(
        JSON.parse(
          readFileSync(
            path.join(
              process.cwd(),
              'public/data/elevation/chattanooga',
              `${slugForTrail(trail)}.json`,
            ),
            'utf8',
          ),
        ),
      );

      const feature = byName.get(trail.trailName);
      expect(profile, trail.trailName).not.toBeNull();
      if (!profile) {
        continue;
      }
      expect(profile.profile.length).toBeGreaterThan(1);
      expect(profile.geometryGapDetails ?? []).toHaveLength(
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
