import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { slugForTrail } from '@/data/mountain-bike-trails';
import { parseElevationProfile } from '@/utils/elevation-profile';
import { bendData } from './index';

interface TrailFeature {
  geometry: {
    coordinates: [number, number][][];
    type: 'MultiLineString';
  };
  properties: { slug: string };
  type: 'Feature';
}

const collection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'public/data/bend/trails.geojson'),
    'utf8',
  ),
) as { features: TrailFeature[]; type: 'FeatureCollection' };

describe('Bend trail seed artifacts', () => {
  it('keeps geometry, summaries, and profiles in sync for all 182 trails', () => {
    const trails = bendData.mountainBikeTrails;
    const bySlug = new Map(
      collection.features.map((feature) => [feature.properties.slug, feature]),
    );

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(182);
    expect(trails).toHaveLength(182);
    expect(bySlug.size).toBe(182);

    for (const trail of trails) {
      const slug = slugForTrail(trail);
      const feature = bySlug.get(slug);
      const profile = parseElevationProfile(
        JSON.parse(
          readFileSync(
            path.join(
              process.cwd(),
              'public/data/elevation/bend',
              `${slug}.json`,
            ),
            'utf8',
          ),
        ),
      );

      expect(feature).toBeDefined();
      expect(profile, trail.trailName).not.toBeNull();
      if (!profile) {
        continue;
      }
      expect(profile.trail).toBe(trail.trailName);
      expect(profile.profile.length).toBeGreaterThan(1);
      // The profile stores whole feet while the summary rounds from meters, so
      // conversion can put the two on opposite sides of a 0.01-mile boundary.
      expect(trail.distance).toBeDefined();
      expect(
        Math.abs(
          Math.round((profile.distance / 5280) * 100) -
            Math.round((trail.distance ?? 0) * 100),
        ),
      ).toBeLessThanOrEqual(1);
      expect(Math.round(profile.gain)).toBe(trail.elevationGain);
      expect(Math.round(profile.loss)).toBe(trail.elevationLoss);
      expect(Math.round(profile.max)).toBe(trail.elevationMax);
      expect(Math.round(profile.min)).toBe(trail.elevationMin);

      const profileCoordinates = new Set(
        profile.profile.map(
          ([, , longitude, latitude]) => `${longitude},${latitude}`,
        ),
      );
      for (const part of feature?.geometry.coordinates ?? []) {
        const endpoints = [part[0], part[part.length - 1]];
        for (const [longitude, latitude] of endpoints) {
          expect(profileCoordinates.has(`${longitude},${latitude}`)).toBe(true);
        }
      }
    }
  });
});
