/**
 * Builds a curated trail from the OSM ways it rides on.
 *
 * This is the TypeScript equivalent of what scripts/build_bend_trails.py does
 * offline, reduced to the part an editor needs when they press save: given a
 * list of OSM way ids, fetch the ways, join them into a line, measure it, and
 * sample its elevation.
 *
 * The trail's geometry is *derived*, never authored. Re-running this against a
 * refreshed OSM extract is how a rerouted trail updates itself.
 */
import { M_TO_FT, METERS_TO_MILES } from '@/payload/osm/units';
import {
  assembleWays,
  boundsOf,
  lengthMeters,
  type AssemblyGap,
} from './assemble';
import { fetchWaysByIds, type OverpassOptions } from './overpass';
import { sampleTerrain } from './terrain';
import { computeElevation, pointsToElevationProfile } from '@/utils/ride-stats';
import type { ElevationProfile } from '@/data/mountain-bike-trails';

export interface BuiltTrail {
  /** [swLng, swLat, neLng, neLat], measured from the geometry. */
  bounds: [number, number, number, number] | null;
  /** Miles. */
  distance: number;
  /** Feet. */
  elevationGain: number | null;
  elevationLoss: number | null;
  elevationMax: number | null;
  elevationMin: number | null;
  geometry: {
    coordinates: [number, number][][];
    type: 'MultiLineString';
  } | null;
  /** The per-point profile the elevation pane renders. */
  profile: ElevationProfile | null;
  /** Everything an editor needs to judge whether the result is right. */
  report: BuildReport;
}

export interface BuildReport {
  /** Ids that produced no geometry — deleted or renumbered upstream. */
  missingIds: number[];
  /** Breaks between disconnected pieces, worst first. */
  gaps: AssemblyGap[];
  /** Human-readable problems worth showing in the admin. */
  warnings: string[];
  /** Ids that contributed geometry, in joined order. */
  resolvedIds: number[];
}

export interface BuildOptions extends OverpassOptions {
  /** Mapbox token for terrain sampling; elevation is skipped without one. */
  mapboxToken?: string;
  /** Set false to skip terrain sampling (faster; used by tests). */
  withElevation?: boolean;
}

/**
 * A trail assembled from ways that don't touch is usually a mistake — a wrong
 * way picked, or a missing connector. Anything beyond this is called out.
 */
const NOTABLE_GAP_M = 50;

export async function buildTrailFromOsm(
  osmIds: number[],
  name: string,
  options: BuildOptions = {},
): Promise<BuiltTrail> {
  const requested = [...new Set(osmIds)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );

  const empty: BuiltTrail = {
    bounds: null,
    distance: 0,
    elevationGain: null,
    elevationLoss: null,
    elevationMax: null,
    elevationMin: null,
    geometry: null,
    profile: null,
    report: { gaps: [], missingIds: [], resolvedIds: [], warnings: [] },
  };

  if (requested.length === 0) {
    return empty;
  }

  const ways = await fetchWaysByIds(requested, options);
  const found = new Set(ways.map((way) => way.id));
  const missingIds = requested.filter((id) => !found.has(id));

  if (ways.length === 0) {
    return {
      ...empty,
      report: {
        gaps: [],
        missingIds,
        resolvedIds: [],
        warnings: [
          'None of these OSM ways could be found. They may have been deleted or split upstream — re-pick the trail on the map.',
        ],
      },
    };
  }

  // Preserve the order the editor picked; it disambiguates trails that double
  // back on themselves, where several joins are geometrically valid.
  const ordered = requested
    .map((id) => ways.find((way) => way.id === id))
    .filter((way): way is NonNullable<typeof way> => Boolean(way));

  const { gaps, orderedIds, parts } = assembleWays(ordered);

  const warnings: string[] = [];
  if (missingIds.length > 0) {
    warnings.push(
      `${missingIds.length} of ${requested.length} ways no longer exist in OSM (${missingIds.join(', ')}). The trail was built from the rest.`,
    );
  }
  const notable = gaps.filter((gap) => gap.distanceMeters > NOTABLE_GAP_M);
  if (notable.length > 0) {
    warnings.push(
      `The picked ways form ${parts.length} disconnected pieces; the largest break is ${notable[0].distanceMeters} m. A connecting way is probably missing.`,
    );
  }

  const meters = lengthMeters(parts);
  const line = parts.flat();

  let profile: ElevationProfile | null = null;
  let gain: number | null = null;
  let loss: number | null = null;
  let min: number | null = null;
  let max: number | null = null;

  if (options.withElevation !== false && options.mapboxToken) {
    const points = await sampleTerrain(line, options.mapboxToken);
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
    bounds: boundsOf(parts),
    distance: Number((meters * METERS_TO_MILES).toFixed(2)),
    elevationGain: gain,
    elevationLoss: loss,
    elevationMax: max,
    elevationMin: min,
    geometry:
      parts.length > 0 ? { coordinates: parts, type: 'MultiLineString' } : null,
    profile,
    report: { gaps, missingIds, resolvedIds: orderedIds, warnings },
  };
}
