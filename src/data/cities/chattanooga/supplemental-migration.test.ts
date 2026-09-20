import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import migrationTrails from '@/migrations/data/20260919_223908_chattanooga_supplemental_trails.json';
import { mountainBikeTrails } from '@/data/mountain-bike-trails.data';
import measurementsJson from './trail-measurements.json';

interface SupplementalFeature {
  geometry: unknown;
  properties: {
    source: string;
    Trail: string;
  };
}

interface SupplementalCollection {
  features: SupplementalFeature[];
}

const supplementalCollection = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      'public/data/chattanooga/trails-supplemental.geojson',
    ),
    'utf8',
  ),
) as SupplementalCollection;

const measurements = measurementsJson as Record<
  string,
  {
    defaultBounds: number[];
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    elevationMax: number;
    elevationMin: number;
  }
>;

describe('Chattanooga supplemental trail data migration', () => {
  it('keeps its immutable backfill in sync with the prepared import data', () => {
    const migrationByName = new Map(
      migrationTrails.map((trail) => [trail.trailName, trail]),
    );

    expect(migrationTrails).toHaveLength(6);
    expect(migrationByName.size).toBe(migrationTrails.length);
    expect(supplementalCollection.features).toHaveLength(
      migrationTrails.length,
    );

    for (const feature of supplementalCollection.features) {
      const trailName = feature.properties.Trail;
      const migrationTrail = migrationByName.get(trailName);
      const measurement = measurements[trailName];
      const previousTrail = mountainBikeTrails.find(
        (trail) => trail.trailName === trailName,
      );
      const profile = JSON.parse(
        readFileSync(
          path.join(process.cwd(), feature.properties.source),
          'utf8',
        ),
      ) as unknown;

      expect(migrationTrail).toBeDefined();
      expect(measurement).toBeDefined();
      expect(previousTrail).toBeDefined();
      expect(migrationTrail).toEqual(
        expect.objectContaining({
          bounds: measurement.defaultBounds,
          distance: measurement.distance,
          elevationGain: measurement.elevationGain,
          elevationLoss: measurement.elevationLoss,
          elevationMax: measurement.elevationMax,
          elevationMin: measurement.elevationMin,
          elevationProfile: profile,
          geom: feature.geometry,
          previousBounds: previousTrail?.defaultBounds,
          previousDistance: previousTrail?.distance,
          trailName,
        }),
      );
    }
  });
});
