import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import repairData from '@/migrations/data/20260921_152202_cherokee_trail_geometry.json';
import measurementsJson from './trail-measurements.json';

interface TrailFeature {
  geometry: unknown;
  properties: { Trail: string };
}

const collection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'public/data/chattanooga/trails.geojson'),
    'utf8',
  ),
) as { features: TrailFeature[] };

const profile = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      'public/data/elevation/chattanooga/cherokee-trail.json',
    ),
    'utf8',
  ),
) as unknown;

describe('Cherokee Trail geometry repair migration', () => {
  it('keeps its forward repair in sync with the prepared artifacts', () => {
    const repair = repairData[0];
    const feature = collection.features.find(
      (candidate) => candidate.properties.Trail === repair.trailName,
    );
    const measurement = measurementsJson['Cherokee Trail'];

    expect(repairData).toHaveLength(1);
    expect(repair).toEqual(
      expect.objectContaining({
        bounds: measurement.defaultBounds,
        distance: measurement.distance,
        elevationGain: measurement.elevationGain,
        elevationLoss: measurement.elevationLoss,
        elevationMax: measurement.elevationMax,
        elevationMin: measurement.elevationMin,
        elevationProfile: profile,
        geom: feature?.geometry,
        trailName: 'Cherokee Trail',
      }),
    );
    expect(repair.geom.coordinates).toHaveLength(1);
    expect(repair.previousGeom.coordinates).toHaveLength(2);
    expect(repair.elevationProfile).not.toHaveProperty('geometryGapDetails');
    expect(repair.previousElevationProfile.geometryGapDetails).toHaveLength(1);
  });
});
