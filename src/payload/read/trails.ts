import 'server-only';

/**
 * Reads curated trails out of Payload for the public map.
 *
 * Uses the Local API — a typed function call straight into Payload, with no
 * HTTP round trip — so this runs inside the page render rather than as a
 * client-side fetch.
 *
 * Returns the same `MountainBikeTrail` shape the app has always used, so the
 * map, sidebar, and elevation pane don't care where a trail came from. The one
 * field that can't survive a database round trip is `icon` (a FontAwesome
 * object), which is reconstructed from the stored `kind`.
 *
 * **Never throws.** A missing or unreachable database returns an empty list,
 * and the caller falls back to the checked-in data — losing the CMS must not
 * take the public map down with it.
 */
import { faMountain, faRoute } from '@fortawesome/free-solid-svg-icons';
import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { RATING_COLORS, UNRATED_COLOR } from '@/data/trail-metadata';
import type { Trail } from '@/payload-types';

/** Greenways are drawn in their own green regardless of difficulty. */
const GREENWAY_COLOR = '#059669';

/**
 * Colour is derived rather than stored, so changing the palette is one edit
 * here instead of a migration over every row.
 */
function colorFor(trail: Trail): string {
  if (trail.kind === 'greenway') {
    return GREENWAY_COLOR;
  }
  return RATING_COLORS[trail.rating ?? ''] ?? UNRATED_COLOR;
}

function boundsFor(
  value: Trail['bounds'],
): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite)
    ? (numbers as [number, number, number, number])
    : undefined;
}

function osmIdsFor(value: Trail['osmIds']): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? ids : undefined;
}

/**
 * `area` is a relationship, so at depth 1 it arrives as the related document.
 * The app has always worked with a plain `recArea` string, so unwrap it here
 * rather than teach every consumer about the join.
 */
function areaOf(trail: Trail): { name: string; region?: string } {
  const area = trail.area;
  if (area && typeof area === 'object') {
    return {
      name: area.name ?? '',
      region: area.region ?? undefined,
    };
  }
  return { name: '' };
}

function toMountainBikeTrail(trail: Trail): MountainBikeTrail {
  const area = areaOf(trail);
  return {
    color: colorFor(trail),
    defaultBounds: boundsFor(trail.bounds),
    displayName: trail.displayName ?? trail.trailName ?? '',
    distance: trail.distance ?? undefined,
    elevationGain: trail.elevationGain ?? undefined,
    elevationLoss: trail.elevationLoss ?? undefined,
    elevationMax: trail.elevationMax ?? undefined,
    elevationMin: trail.elevationMin ?? undefined,
    // An IconDefinition can't round-trip through the database, so it's rebuilt
    // from `kind` — the same field that drives the colour.
    icon: trail.kind === 'greenway' ? faRoute : faMountain,
    osmIds: osmIdsFor(trail.osmIds),
    // `rating` is a select with an explicit 'unrated' option; the app's type
    // uses '' for the same thing.
    rating: trail.rating === 'unrated' ? '' : (trail.rating ?? ''),
    recArea: area.name,
    // Set only when the area carries one; the app falls back to its built-in
    // REGION_MAP otherwise.
    region: area.region,
    slug: trail.slug ?? undefined,
    trailName: trail.trailName ?? '',
  };
}

export interface CityTrailData {
  /** GeoJSON FeatureCollection of every trail that has geometry. */
  geojson: {
    features: {
      geometry: unknown;
      properties: Record<string, unknown>;
      type: 'Feature';
    }[];
    type: 'FeatureCollection';
  };
  /**
   * Why there might be no trails, which callers need to tell apart:
   *
   *   ok           rows were found
   *   empty        the database answered, this city just has none seeded
   *   unavailable  no DATABASE_URL, or the query failed
   *
   * Reporting `empty` as `unavailable` would send someone debugging a database
   * that is working perfectly well.
   */
  status: 'empty' | 'ok' | 'unavailable';
  trails: MountainBikeTrail[];
}

const NONE = {
  geojson: { features: [], type: 'FeatureCollection' as const },
  trails: [],
};

/**
 * Published trails for a city, plus their geometry as a FeatureCollection
 * shaped like the static files the map already reads.
 */
export async function getCityTrails(city: CityId): Promise<CityTrailData> {
  if (!process.env.DATABASE_URL) {
    return { ...NONE, status: 'unavailable' };
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: 'trails',
      // 1 so the `area` relationship resolves to its document rather than an id.
      depth: 1,
      // One city's curated trails is a few hundred rows; paging them would just
      // add round trips.
      limit: 2000,
      pagination: false,
      sort: 'displayName',
      where: {
        and: [{ city: { equals: city } }, { _status: { equals: 'published' } }],
      },
    });

    if (result.docs.length === 0) {
      return { ...NONE, status: 'empty' };
    }

    const trails = result.docs.map(toMountainBikeTrail);

    const features = result.docs
      .filter((trail) => trail.geom)
      .map((trail) => ({
        geometry: trail.geom,
        properties: {
          osmIds: osmIdsFor(trail.osmIds) ?? [],
          slug: trail.slug ?? undefined,
          Trail: trail.trailName ?? '',
        },
        type: 'Feature' as const,
      }));

    return {
      geojson: { features, type: 'FeatureCollection' },
      status: 'ok',
      trails,
    };
  } catch (error) {
    // The map must survive the CMS being down. Log loudly, return nothing, and
    // let the caller fall back to the checked-in data.
    console.error(
      `Could not read trails for "${city}" from Payload; falling back to the checked-in data.`,
      error,
    );
    return { ...NONE, status: 'unavailable' };
  }
}
