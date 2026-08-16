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
import { assembleWays, NOTABLE_GAP_M, type AssemblyGap } from './assemble';
import { measureParts, type MeasureOptions } from './measure';
import { fetchWaysByIds, type OverpassOptions } from './overpass';
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

export interface BuildOptions extends MeasureOptions, OverpassOptions {}

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

  const measured = await measureParts(parts, name, options);
  warnings.push(...measured.warnings);

  return {
    bounds: measured.bounds,
    distance: measured.distance,
    elevationGain: measured.elevationGain,
    elevationLoss: measured.elevationLoss,
    elevationMax: measured.elevationMax,
    elevationMin: measured.elevationMin,
    geometry:
      parts.length > 0 ? { coordinates: parts, type: 'MultiLineString' } : null,
    profile: measured.profile,
    report: { gaps, missingIds, resolvedIds: orderedIds, warnings },
  };
}
