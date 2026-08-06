/**
 * Shared machinery for the per-city trail seeds.
 *
 * The cities get their own scripts because their pipelines genuinely differ —
 * Bend is OSM-derived with real geometry, Chattanooga is a Mapbox tileset with
 * none — and a single script behind a `--city` flag hid that. What's actually
 * common is only this: connecting to Payload, translating a `MountainBikeTrail`
 * into a row, and upserting it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPayload, type Payload } from 'payload';
import config from '../../src/payload.config';
import type { CityId } from '../../src/data/cities/types';
import type { MountainBikeTrail } from '../../src/data/mountain-bike-trails';
import type { Trail } from '../../src/payload-types';

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const RATINGS: Trail['rating'][] = [
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'unrated',
];

export interface MultiLineString {
  coordinates: [number, number][][];
  type: 'MultiLineString';
}

export interface SeedOptions {
  dryRun: boolean;
}

export function parseArgs(argv: string[]): SeedOptions {
  return { dryRun: argv.includes('--dry-run') };
}

export async function connect(): Promise<Payload> {
  return getPayload({ config });
}

/** '' in the source data means "not rated", which the select stores explicitly. */
export function ratingFor(trail: MountainBikeTrail): Trail['rating'] {
  if (trail.rating === '') {
    return 'unrated';
  }
  const rating = trail.rating as Trail['rating'];
  if (!RATINGS.includes(rating)) {
    throw new Error(
      `Trail "${trail.trailName}" has rating "${trail.rating}", expected one of: ${RATINGS.join(', ')}`,
    );
  }
  return rating;
}

/**
 * faRoute marks the greenways in the source data, against faMountain for
 * singletrack. Storing the distinction rather than the icon lets the app derive
 * both icon and colour from it.
 */
export function kindFor(trail: MountainBikeTrail): Trail['kind'] {
  return trail.icon?.iconName === 'route' ? 'greenway' : 'trail';
}

export interface SeedResult {
  created: number;
  updated: number;
  withGeometry: number;
}

export interface UpsertArgs {
  city: CityId;
  /** Geometry for this trail, when the city has any. */
  geom: MultiLineString | null;
  /**
   * 'osm' means the trail can be rebuilt from its way ids; 'imported' means it
   * keeps whatever it arrived with and the rebuild hook leaves it alone.
   */
  geometrySource: 'imported' | 'osm';
  trail: MountainBikeTrail;
}

/**
 * Writes one trail, matching on (trailName, city) so re-running updates rather
 * than duplicating.
 *
 * Always passes `context.skipOsmRebuild`. Without it the beforeChange hook
 * would fire one Overpass request per trail — several hundred against a shared
 * community endpoint, which gets the machine rate-limited long before the seed
 * finishes.
 */
export async function upsertTrail(
  payload: Payload,
  { city, geom, geometrySource, trail }: UpsertArgs,
): Promise<'created' | 'updated'> {
  const data = {
    _status: 'published' as const,
    bounds: trail.defaultBounds ?? null,
    city,
    displayName: trail.displayName,
    distance: trail.distance ?? null,
    elevationGain: trail.elevationGain ?? null,
    elevationLoss: trail.elevationLoss ?? null,
    elevationMax: trail.elevationMax ?? null,
    elevationMin: trail.elevationMin ?? null,
    // Payload types a `json` field as an open-ended JSON value, so the precise
    // GeoJSON shape has to be widened at this boundary.
    geom: geom as Trail['geom'],
    geometrySource,
    kind: kindFor(trail),
    osmIds: (trail.osmIds ?? null) as Trail['osmIds'],
    rating: ratingFor(trail),
    recArea: trail.recArea,
    slug: trail.slug ?? null,
    trailName: trail.trailName,
  };

  const existing = await payload.find({
    collection: 'trails',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        { trailName: { equals: trail.trailName } },
        { city: { equals: city } },
      ],
    },
  });

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'trails',
      context: { skipOsmRebuild: true },
      data,
      id: existing.docs[0].id,
    });
    return 'updated';
  }

  await payload.create({
    collection: 'trails',
    context: { skipOsmRebuild: true },
    data,
  });
  return 'created';
}

export function report(
  payload: Payload,
  city: CityId,
  { created, updated, withGeometry }: SeedResult,
  dryRun: boolean,
): void {
  if (dryRun) {
    payload.logger.info(`${city}: dry run — nothing written.`);
    return;
  }
  payload.logger.info(
    `${city}: created ${created}, updated ${updated}. ${withGeometry} have geometry.`,
  );
}

/** Wraps a seed so failures exit non-zero instead of an unhandled rejection. */
export function run(seed: () => Promise<void>): void {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
