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
import { boundsOf, lengthMeters, type AssemblyGap } from './assemble';
import { elevationSections } from './elevation-sections';
import { sampleTerrainParts, type TerrainPoint } from './terrain';
import { M_TO_FT, METERS_TO_MILES } from './units';
import {
  computeElevation,
  haversineDistance,
  pointsToElevationProfile,
} from '@/utils/ride-stats';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import type { ElevationTotals } from '@/utils/elevation';

export interface Measurements {
  /** [swLng, swLat, neLng, neLat], for zoom-to-fit. */
  bounds: [number, number, number, number] | null;
  /** Miles. */
  distance: number;
  /**
   * Breaks between measured sections, worst first. Part indices refer to the
   * supplied geometry.
   */
  gaps: AssemblyGap[];
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
  gaps: [],
  profile: null,
  warnings: [],
};

/**
 * Measures each continuous section, including joins between source parts.
 * Distance and climbing exclude the transition between sections.
 */
export async function measureParts(
  parts: [number, number][][],
  name: string,
  options: MeasureOptions = {},
): Promise<Measurements> {
  const sections = elevationSections(parts);
  if (sections.length === 0) {
    return { ...EMPTY_MEASUREMENTS };
  }
  const runs = sections.map(({ coordinates }) => coordinates);
  const gaps = sections
    .slice(1)
    .map((section, index) => {
      const previous = sections[index];
      const [fromLng, fromLat] =
        previous.coordinates[previous.coordinates.length - 1];
      const [toLng, toLat] = section.coordinates[0];
      return {
        distanceMeters: Math.round(
          haversineDistance(fromLat, fromLng, toLat, toLng),
        ),
        fromPart: previous.lastPart,
        toPart: section.firstPart,
      };
    })
    .sort((a, b) => b.distanceMeters - a.distanceMeters);

  const warnings: string[] = [];
  const meters = lengthMeters(runs);

  let profile: ElevationProfile | null = null;
  let gain: number | null = null;
  let loss: number | null = null;
  let min: number | null = null;
  let max: number | null = null;

  if (options.withElevation !== false && options.mapboxToken) {
    const sampled = await sampleTerrainParts(runs, options.mapboxToken);
    if (sampled) {
      const totals = totalsAcrossParts(sampled);
      gain = Math.round(totals.gain * M_TO_FT);
      loss = Math.round(totals.loss * M_TO_FT);
      min = Math.round(totals.min * M_TO_FT);
      max = Math.round(totals.max * M_TO_FT);
      profile = profileAcrossParts(sampled, name, meters, totals);
    } else {
      warnings.push(
        'No elevation data could be read for this trail; distance is still accurate.',
      );
    }
  }

  return {
    bounds: boundsOf(parts),
    distance: Number((meters * METERS_TO_MILES).toFixed(2)),
    elevationGain: gain,
    elevationLoss: loss,
    elevationMax: max,
    elevationMin: min,
    gaps,
    profile,
    warnings,
  };
}

/**
 * Combines per-part elevation into one set of totals.
 *
 * Gain and loss add up: each part climbs and descends on its own, and the step
 * between one part's last reading and the next's first is a gap, not terrain.
 * Min and max are extremes over everything that was read.
 */
function totalsAcrossParts(sampled: TerrainPoint[][]): ElevationTotals {
  let gain = 0;
  let loss = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const points of sampled) {
    const part = computeElevation(
      points as Parameters<typeof computeElevation>[0],
    );
    gain += part.gain;
    loss += part.loss;
    min = Math.min(min, part.min);
    max = Math.max(max, part.max);
  }

  return {
    gain,
    loss,
    max: Number.isFinite(max) ? max : 0,
    min: Number.isFinite(min) ? min : 0,
  };
}

/**
 * Builds the pane's profile from the sampled parts.
 *
 * `meters` is the same {@link lengthMeters} the stored distance comes from, and
 * it is handed to the `stats` override so the pane's headline distance is the
 * one the sidebar shows for the trail rather than a re-derivation of it.
 */
function profileAcrossParts(
  sampled: TerrainPoint[][],
  name: string,
  meters: number,
  totals: ElevationTotals,
): ElevationProfile | null {
  // Mark every new part instead of building a separate profile per part.
  // `pointsToElevationProfile` needs five points overall, but some legitimate
  // connector parts are shorter than five terrain samples. Measuring each
  // part independently dropped those short pieces from the chart and GPX even
  // though their distance was included in the headline total.
  const segmented = sampled.flatMap((part, partIndex) =>
    part.map((point, pointIndex) =>
      partIndex > 0 && pointIndex === 0
        ? { ...point, segmentStart: true }
        : point,
    ),
  );

  return pointsToElevationProfile(segmented, name, {
    distance: meters,
    elevationGain: totals.gain,
    elevationLoss: totals.loss,
    elevationMax: totals.max,
    elevationMin: totals.min,
  });
}
