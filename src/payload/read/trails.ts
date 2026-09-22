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
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import {
  PUBLIC_TRAIL_CACHE_REVALIDATE_SECONDS,
  PUBLIC_TRAIL_GEOJSON_CACHE_TAG,
  PUBLIC_TRAIL_SUMMARIES_CACHE_TAG,
} from '@/payload/cache/public-trails';
import { appearanceFor } from './appearance';
import type { Trail, TrailKind, TrailRating } from '@/payload-types';

type TrailReadStatus = 'empty' | 'ok' | 'unavailable';
type TrailSummaryDocument = Pick<
  Trail,
  | 'area'
  | 'bounds'
  | 'displayName'
  | 'distance'
  | 'elevationGain'
  | 'elevationLoss'
  | 'elevationMax'
  | 'elevationMin'
  | 'kind'
  | 'osmIds'
  | 'rating'
  | 'slug'
  | 'trailName'
>;

/**
 * `rating` and `kind` are relationships, so at depth 1 they arrive as the
 * related document — but only if the row still points at one. A rating deleted
 * out from under a trail leaves an id, or null, and neither should throw.
 */
function ratingOf(trail: Pick<Trail, 'rating'>): TrailRating | null {
  return trail.rating && typeof trail.rating === 'object' ? trail.rating : null;
}

function kindOf(trail: Pick<Trail, 'kind'>): TrailKind | null {
  return trail.kind && typeof trail.kind === 'object' ? trail.kind : null;
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
function areaOf(trail: Pick<Trail, 'area'>): { name: string; region?: string } {
  const area = trail.area;
  if (area && typeof area === 'object') {
    return {
      name: area.name ?? '',
      region: area.region ?? undefined,
    };
  }
  return { name: '' };
}

function toMountainBikeTrail(trail: TrailSummaryDocument): MountainBikeTrail {
  const area = areaOf(trail);
  // Colour, icon and the rating key all come off the two vocabulary rows —
  // see `appearance.ts` for which one wins where.
  const appearance = appearanceFor(ratingOf(trail), kindOf(trail));
  return {
    color: appearance.color,
    defaultBounds: boundsFor(trail.bounds),
    displayName: trail.displayName ?? trail.trailName ?? '',
    distance: trail.distance ?? undefined,
    elevationGain: trail.elevationGain ?? undefined,
    elevationLoss: trail.elevationLoss ?? undefined,
    elevationMax: trail.elevationMax ?? undefined,
    elevationMin: trail.elevationMin ?? undefined,
    icon: appearance.icon,
    osmIds: osmIdsFor(trail.osmIds),
    rating: appearance.rating,
    recArea: area.name,
    // Set only when the area carries one; the app falls back to its built-in
    // REGION_MAP otherwise.
    region: area.region,
    slug: trail.slug ?? undefined,
    trailName: trail.trailName ?? '',
  };
}

export interface TrailFeatureCollection {
  /** GeoJSON FeatureCollection of every trail that has geometry. */
  features: {
    geometry: unknown;
    properties: Record<string, unknown>;
    type: 'Feature';
  }[];
  type: 'FeatureCollection';
}

export interface CityTrailSummaryData {
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
  status: TrailReadStatus;
  trails: MountainBikeTrail[];
}

export interface CityTrailGeojsonData {
  geojson: TrailFeatureCollection;
  status: TrailReadStatus;
}

const EMPTY_GEOJSON: TrailFeatureCollection = {
  features: [],
  type: 'FeatureCollection',
};

/**
 * Published trail metadata for one city's sidebar. Geometry and elevation
 * profiles are deliberately excluded because the homepage does not use them.
 */
async function readCityTrailSummaries(
  city: CityId,
): Promise<CityTrailSummaryData> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'trails',
    // Resolve only the three relationships that affect public presentation.
    depth: 1,
    limit: 2000,
    pagination: false,
    populate: {
      'trail-areas': { name: true, region: true },
      'trail-kinds': { color: true, icon: true, value: true },
      'trail-ratings': { color: true, value: true },
    },
    select: {
      area: true,
      bounds: true,
      displayName: true,
      distance: true,
      elevationGain: true,
      elevationLoss: true,
      elevationMax: true,
      elevationMin: true,
      kind: true,
      osmIds: true,
      rating: true,
      slug: true,
      trailName: true,
    },
    sort: 'displayName',
    where: {
      and: [{ city: { equals: city } }, { _status: { equals: 'published' } }],
    },
  });

  return {
    status: result.docs.length > 0 ? 'ok' : 'empty',
    trails: result.docs.map(toMountainBikeTrail),
  };
}

const readCachedCityTrailSummaries = unstable_cache(
  readCityTrailSummaries,
  ['public-city-trail-summaries'],
  {
    revalidate: PUBLIC_TRAIL_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG],
  },
);

/** Read public trail metadata for a city. Never throws. */
export async function getCityTrailSummaries(
  city: CityId,
): Promise<CityTrailSummaryData> {
  if (!process.env.DATABASE_URL) {
    return { status: 'unavailable', trails: [] };
  }

  try {
    return await readCachedCityTrailSummaries(city);
  } catch (error) {
    console.error(
      `Could not read trail summaries for "${city}" from Payload; falling back to the checked-in data.`,
      error,
    );
    return { status: 'unavailable', trails: [] };
  }
}

/**
 * Published geometry shaped like the static GeoJSON files the map already
 * reads. Sidebar metadata and elevation profiles are deliberately excluded.
 */
async function readCityTrailGeojson(
  city: CityId,
): Promise<CityTrailGeojsonData> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'trails',
    depth: 0,
    limit: 2000,
    pagination: false,
    select: {
      geom: true,
      osmIds: true,
      slug: true,
      trailName: true,
    },
    sort: 'trailName',
    where: {
      and: [{ city: { equals: city } }, { _status: { equals: 'published' } }],
    },
  });

  const features = result.docs
    .filter((trail) => Boolean(trail.geom))
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
    status: result.docs.length > 0 ? 'ok' : 'empty',
  };
}

const readCachedCityTrailGeojson = unstable_cache(
  readCityTrailGeojson,
  ['public-city-trail-geojson'],
  {
    revalidate: PUBLIC_TRAIL_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_TRAIL_GEOJSON_CACHE_TAG],
  },
);

/** Read public trail geometry for a city. Never throws. */
export async function getCityTrailGeojson(
  city: CityId,
): Promise<CityTrailGeojsonData> {
  if (!process.env.DATABASE_URL) {
    return { geojson: EMPTY_GEOJSON, status: 'unavailable' };
  }

  try {
    return await readCachedCityTrailGeojson(city);
  } catch (error) {
    console.error(
      `Could not read trail geometry for "${city}" from Payload; falling back to the checked-in data.`,
      error,
    );
    return { geojson: EMPTY_GEOJSON, status: 'unavailable' };
  }
}
