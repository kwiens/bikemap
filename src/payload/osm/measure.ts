/**
 * Measures a trail's line: distance, bounding box, and elevation.
 *
 * Split out of `build.ts` because geometry now reaches a trail two ways — it is
 * assembled from OSM ways, or it is adjusted by hand in the geometry editor —
 * and both have to be measured identically. A hand-edited trail whose distance
 * was computed even slightly differently from an OSM-built one would be a quiet
 * inconsistency running through the sidebar, the pane, and the ride stats.
 *
 * Measurement is deliberately server-side in both cases. The browser can
 * estimate distance while you drag, but the number that gets *stored* comes
 * from here, sampled against the same DEM at the same zoom every time.
 */
import { boundsOf, lengthMeters } from './assemble';
import { sampleTerrain } from './terrain';
import { M_TO_FT, METERS_TO_MILES } from './units';
import { computeElevation, pointsToElevationProfile } from '@/utils/ride-stats';
import type { ElevationProfile } from '@/data/mountain-bike-trails';

export interface Measurements {
  /** [swLng, swLat, neLng, neLat], for zoom-to-fit. */
  bounds: [number, number, number, number] | null;
  /** Miles. */
  distance: number;
  /** Feet. Null when no terrain could be read. */
  elevationGain: number | null;
  elevationLoss: number | null;
  elevationMax: number | null;
  elevationMin: number | null;
  /** The per-point profile the elevation pane renders. */
  profile: ElevationProfile | null;
  /** Non-fatal problems worth surfacing in the admin. */
  warnings: string[];
}

export interface MeasureOptions {
  /** Mapbox token for terrain sampling; elevation is skipped without one. */
  mapboxToken?: string;
  /** Set false to skip terrain sampling (faster; used by tests). */
  withElevation?: boolean;
}

export const EMPTY_MEASUREMENTS: Measurements = {
  bounds: null,
  distance: 0,
  elevationGain: null,
  elevationLoss: null,
  elevationMax: null,
  elevationMin: null,
  profile: null,
  warnings: [],
};

/**
 * Measures connected runs of coordinates.
 *
 * Gaps between parts are not walked, so a trail in two pieces measures the sum
 * of the pieces rather than including the hop between them.
 */
export async function measureParts(
  parts: [number, number][][],
  name: string,
  options: MeasureOptions = {},
): Promise<Measurements> {
  const usable = parts.filter((part) => part.length >= 2);
  if (usable.length === 0) {
    return { ...EMPTY_MEASUREMENTS };
  }

  const warnings: string[] = [];
  const meters = lengthMeters(usable);

  let profile: ElevationProfile | null = null;
  let gain: number | null = null;
  let loss: number | null = null;
  let min: number | null = null;
  let max: number | null = null;

  if (options.withElevation !== false && options.mapboxToken) {
    // Sampled as one continuous line: the parts are pieces of a single trail,
    // and the profile the pane draws runs end to end across them.
    const points = await sampleTerrain(usable.flat(), options.mapboxToken);
    if (points) {
      const elevation = computeElevation(
        points as Parameters<typeof computeElevation>[0],
      );
      gain = Math.round(elevation.gain * M_TO_FT);
      loss = Math.round(elevation.loss * M_TO_FT);
      min = Math.round(elevation.min * M_TO_FT);
      max = Math.round(elevation.max * M_TO_FT);
      profile = pointsToElevationProfile(points, name);
    } else {
      warnings.push(
        'No elevation data could be read for this trail; distance is still accurate.',
      );
    }
  }

  return {
    bounds: boundsOf(usable),
    distance: Number((meters * METERS_TO_MILES).toFixed(2)),
    elevationGain: gain,
    elevationLoss: loss,
    elevationMax: max,
    elevationMin: min,
    profile,
    warnings,
  };
}
