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

interface TrailCollection {
  _meta: {
    deprecated: boolean;
    reason: string;
    removeWhen: string;
    status: string;
  };
  features: TrailFeature[];
  type: 'FeatureCollection';
}

const collection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'public/data/chattanooga/trails.geojson'),
    'utf8',
  ),
) as TrailCollection;

const supplementalCollection = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      'public/data/chattanooga/trails-supplemental.geojson',
    ),
    'utf8',
  ),
) as TrailCollection;

const mountainBikeTrails = chattanoogaData.mountainBikeTrails;

describe('Chattanooga trail import geometry', () => {
  it('marks both static datasets as deprecated and staged for removal', () => {
    for (const dataset of [collection, supplementalCollection]) {
      expect(dataset._meta).toEqual({
        deprecated: true,
        reason: 'Payload is the authoritative trail source.',
        removeWhen:
          'Fresh databases bootstrap without this file and the runtime static fallback has been removed.',
        status: 'staged-for-removal',
      });
    }
  });

  it('provides valid WGS84 MultiLineStrings for all 224 curated trails', () => {
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
    expect(collection.features).toHaveLength(230);
    expect(
      collection.features.reduce(
        (count, feature) => count + feature.geometry.coordinates.length,
        0,
      ),
    ).toBe(403);
    expect(matched).toHaveLength(224);
    expect(missing).toEqual([]);

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

  it('keeps supplemental source features in the combined import', () => {
    const combinedByName = new Map(
      collection.features.map((feature) => [feature.properties.Trail, feature]),
    );

    expect(supplementalCollection.type).toBe('FeatureCollection');
    expect(supplementalCollection.features.length).toBeGreaterThan(0);
    for (const feature of supplementalCollection.features) {
      expect(combinedByName.get(feature.properties.Trail)).toEqual(feature);
    }
  });

  it('keeps imported geometry, summaries, and static profiles in sync', () => {
    const byName = new Map(
      collection.features.map((feature) => [feature.properties.Trail, feature]),
    );
    const matched = mountainBikeTrails.filter((trail) =>
      byName.has(trail.trailName),
    );

    expect(matched).toHaveLength(224);
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
