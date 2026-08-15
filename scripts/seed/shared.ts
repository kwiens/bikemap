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
import {
  type MountainBikeTrail,
  slugForTrail,
} from '../../src/data/mountain-bike-trails';
import {
  DEFAULT_KIND_VALUE,
  DEFAULT_KINDS,
  DEFAULT_RATINGS,
  UNRATED_VALUE,
} from '../../src/data/trail-vocabulary';
import type { Trail } from '../../src/payload-types';

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * The vocabulary rows a trail points at, resolved once and reused.
 *
 * Ratings and kinds are collections now, so a trail carries an id rather than a
 * literal. The migration seeds the defaults, but the seed creates anything
 * missing too — a database restored from before the vocabularies existed, or
 * one where a row was deleted, should still take a seed rather than fail a few
 * hundred times over.
 */
export interface Vocabulary {
  kinds: Map<string, number>;
  ratings: Map<string, number>;
}

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

/** For a dry run, which writes nothing and so resolves nothing. */
export function emptyVocabulary(): Vocabulary {
  return { kinds: new Map(), ratings: new Map() };
}

/**
 * Loads the rating and kind vocabularies, creating any default row that is
 * missing, and returns a value → id lookup for each.
 *
 * Done once per seed rather than per trail: a few hundred trails share five
 * ratings between them.
 */
export async function loadVocabulary(payload: Payload): Promise<Vocabulary> {
  const ratings = new Map<string, number>();
  const kinds = new Map<string, number>();

  for (const seed of DEFAULT_RATINGS) {
    const id = await findByValue(payload, 'trail-ratings', seed.value);
    ratings.set(
      seed.value,
      id ??
        (await payload.create({ collection: 'trail-ratings', data: seed })).id,
    );
  }

  for (const seed of DEFAULT_KINDS) {
    const id = await findByValue(payload, 'trail-kinds', seed.value);
    kinds.set(
      seed.value,
      id ??
        (await payload.create({ collection: 'trail-kinds', data: seed })).id,
    );
  }

  return { kinds, ratings };
}

/**
 * An existing row's id, or undefined.
 *
 * A row that is already there is left completely alone: a curator may have
 * recoloured or renamed it, and reseeding *trails* has no business undoing
 * that.
 */
async function findByValue(
  payload: Payload,
  collection: 'trail-kinds' | 'trail-ratings',
  value: string,
): Promise<number | undefined> {
  const existing = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    pagination: false,
    where: { value: { equals: value } },
  });
  return existing.docs[0]?.id;
}

/** '' in the source data means "not rated", which the vocabulary has a row for. */
export function ratingIdFor(
  trail: MountainBikeTrail,
  vocabulary: Vocabulary,
): number {
  const value = trail.rating === '' ? UNRATED_VALUE : trail.rating;
  const id = vocabulary.ratings.get(value);
  if (id === undefined) {
    throw new Error(
      `Trail "${trail.trailName}" has rating "${trail.rating}", which is not in the vocabulary: ${[...vocabulary.ratings.keys()].join(', ')}`,
    );
  }
  return id;
}

/**
 * faRoute marks the greenways in the source data, against faMountain for
 * singletrack. Storing the distinction rather than the icon lets the app derive
 * both icon and colour from it.
 */
export function kindIdFor(
  trail: MountainBikeTrail,
  vocabulary: Vocabulary,
): number {
  const value =
    trail.icon?.iconName === 'route' ? 'greenway' : DEFAULT_KIND_VALUE;
  const id = vocabulary.kinds.get(value);
  if (id === undefined) {
    throw new Error(
      `Trail "${trail.trailName}" has kind "${value}", which is not in the vocabulary.`,
    );
  }
  return id;
}

export interface SeedResult {
  created: number;
  /** Trail names whose hand-edited geometry the run left in place. */
  preserved: string[];
  updated: number;
  withGeometry: number;
}

/**
 * Creates the trail's recreation area if it doesn't exist yet, and returns its
 * id. The source data carries the area as a plain string, so the first trail
 * mentioning an area is what brings it into being.
 *
 * `region` comes from the city's own `regionFor`, which is the hardcoded map
 * this collection exists to replace — seeding it means the mapping arrives in
 * the database already populated rather than blank.
 */
export async function upsertArea(
  payload: Payload,
  city: CityId,
  name: string,
  region: string,
  cache: Map<string, number>,
): Promise<number> {
  const key = `${city}:${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const existing = await payload.find({
    collection: 'trail-areas',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [{ name: { equals: name } }, { city: { equals: city } }],
    },
  });

  const id =
    existing.docs.length > 0
      ? existing.docs[0].id
      : (
          await payload.create({
            collection: 'trail-areas',
            data: { city, name, region },
          })
        ).id;

  cache.set(key, id);
  return id;
}

export interface UpsertArgs {
  /** Id of the trail's recreation area, from `upsertArea`. */
  areaId: number;
  city: CityId;
  /** Rating and kind lookups, from `loadVocabulary`. */
  vocabulary: Vocabulary;
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
 * A row already marked `geometrySource: 'edited'` keeps its line, its source,
 * and everything measured from it — the seed only refreshes its metadata. That
 * is the whole point of the flag: the checked-in geometry is what a curator
 * edited *away* from, and the stored `elevationProfile` (which no seed writes)
 * still charts the drawn line, so restoring the static one leaves the trail
 * disagreeing with its own chart.
 *
 * Always passes `context.skipOsmRebuild`. Without it the beforeChange hook
 * would fire one Overpass request per trail — several hundred against a shared
 * community endpoint, which gets the machine rate-limited long before the seed
 * finishes.
 */
export async function upsertTrail(
  payload: Payload,
  { areaId, city, geom, geometrySource, trail, vocabulary }: UpsertArgs,
): Promise<'created' | 'preserved' | 'updated'> {
  // What the seed exists to carry: what the trail is called and what it belongs
  // to. Written on every run, however the row's geometry is maintained.
  const metadata = {
    _status: 'published' as const,
    area: areaId,
    city,
    displayName: trail.displayName,
    kind: kindIdFor(trail, vocabulary),
    rating: ratingIdFor(trail, vocabulary),
    // `slugForTrail` is the same rule the admin and the client use: an explicit
    // slug when the trail has one, its slugified name otherwise. It is required
    // now, because it is the key the elevation profile is looked up by.
    slug: slugForTrail(trail),
    trailName: trail.trailName,
  };

  // The line, the ways it was built from, and every number derived from it.
  // Withheld from a hand-edited row: these only make sense together.
  const geometry = {
    bounds: trail.defaultBounds ?? null,
    distance: trail.distance ?? null,
    elevationGain: trail.elevationGain ?? null,
    elevationLoss: trail.elevationLoss ?? null,
    elevationMax: trail.elevationMax ?? null,
    elevationMin: trail.elevationMin ?? null,
    // Payload types a `json` field as an open-ended JSON value, so the precise
    // GeoJSON shape has to be widened at this boundary.
    geom: geom as Trail['geom'],
    geometrySource,
    osmIds: (trail.osmIds ?? null) as Trail['osmIds'],
  };

  const existing = await payload.find({
    collection: 'trails',
    depth: 0,
    limit: 1,
    pagination: false,
    // Only the field that decides whether the geometry above may be written —
    // this runs once per trail, so it stays as cheap as the id-only lookup was.
    select: { geometrySource: true },
    where: {
      and: [
        { trailName: { equals: trail.trailName } },
        { city: { equals: city } },
      ],
    },
  });

  const current = existing.docs[0];
  if (current) {
    const handEdited = current.geometrySource === 'edited';
    await payload.update({
      collection: 'trails',
      context: { skipOsmRebuild: true },
      data: handEdited ? metadata : { ...metadata, ...geometry },
      id: current.id,
    });
    return handEdited ? 'preserved' : 'updated';
  }

  await payload.create({
    collection: 'trails',
    context: { skipOsmRebuild: true },
    data: { ...metadata, ...geometry },
  });
  return 'created';
}

export function report(
  payload: Payload,
  city: CityId,
  { created, preserved, updated, withGeometry }: SeedResult,
  dryRun: boolean,
): void {
  if (dryRun) {
    payload.logger.info(`${city}: dry run — nothing written.`);
    return;
  }
  payload.logger.info(
    `${city}: created ${created}, updated ${updated}. ${withGeometry} have geometry.`,
  );
  if (preserved.length > 0) {
    // Named rather than counted: an operator who did not expect a hand-edited
    // trail here needs to know which one to go and look at.
    payload.logger.info(
      `${city}: kept the hand-edited geometry on ${preserved.length} trails (metadata still updated): ${preserved
        .slice(0, 10)
        .join(', ')}${preserved.length > 10 ? ', …' : ''}`,
    );
  }
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
