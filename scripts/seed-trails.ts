/**
 * Imports the checked-in trail data into Payload.
 *
 *   pnpm db:seed
 *   pnpm db:seed --city bend
 *   pnpm db:seed --dry-run
 *
 * This is the one-time migration from `src/data/cities/*` into the database.
 * Once the map reads from Payload, this script is only needed to rebuild a
 * fresh database (or a fork's first run).
 *
 * Geometry comes from whatever each city already has:
 *
 *   Bend          public/data/bend/trails.geojson, matched by slug. Real
 *                 MultiLineStrings, already OSM-derived, and the trails carry
 *                 osmIds — so these are imported as `geometrySource: 'osm'`
 *                 and can be rebuilt from OSM later.
 *   Chattanooga   no geometry and no osmIds; its lines live in a Mapbox
 *                 tileset. Imported as `geometrySource: 'imported'` so the
 *                 rebuild hook leaves them alone until they're matched to OSM.
 *
 * The OSM rebuild is skipped entirely (`context.skipOsmRebuild`) — otherwise
 * this would fire one Overpass request per trail and get the machine blocked.
 *
 * Re-running is safe: rows match on (trailName, city) and update.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPayload } from 'payload';
import config from '../src/payload.config';
import { bendData } from '../src/data/cities/bend';
import { chattanoogaData } from '../src/data/cities/chattanooga';
import type { CityId } from '../src/data/cities/types';
import type { MountainBikeTrail } from '../src/data/mountain-bike-trails';
import { slugForTrail } from '../src/data/mountain-bike-trails';
import type { Trail } from '../src/payload-types';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const CITIES = {
  bend: bendData,
  chattanooga: chattanoogaData,
} as const;

const RATINGS: Trail['rating'][] = [
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'unrated',
];

interface MultiLineString {
  coordinates: [number, number][][];
  type: 'MultiLineString';
}

function parseArgs(argv: string[]): { cities: CityId[]; dryRun: boolean } {
  const cityArg = argv[argv.indexOf('--city') + 1];
  const cities =
    argv.includes('--city') && cityArg
      ? [cityArg as CityId]
      : (Object.keys(CITIES) as CityId[]);

  for (const city of cities) {
    if (!(city in CITIES)) {
      throw new Error(
        `Unknown city "${city}". Expected one of: ${Object.keys(CITIES).join(', ')}`,
      );
    }
  }

  return { cities, dryRun: argv.includes('--dry-run') };
}

/** '' in the source data means "not rated", which the select stores explicitly. */
function ratingFor(trail: MountainBikeTrail): Trail['rating'] {
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
 * faRoute marks the greenways in the source data (23 of them, against 201
 * faMountain). Storing the distinction rather than the icon lets the app pick
 * both icon and colour from it.
 */
function kindFor(trail: MountainBikeTrail): Trail['kind'] {
  return trail.icon?.iconName === 'route' ? 'greenway' : 'trail';
}

/** Bend: slug -> MultiLineString, read once from the generated GeoJSON. */
async function loadBendGeometry(): Promise<Map<string, MultiLineString>> {
  const raw = await readFile(
    path.join(repoRoot, 'public/data/bend/trails.geojson'),
    'utf8',
  );
  const collection = JSON.parse(raw) as {
    features: {
      geometry: MultiLineString;
      properties: { slug?: string };
    }[];
  };

  const bySlug = new Map<string, MultiLineString>();
  for (const feature of collection.features) {
    if (
      feature.properties.slug &&
      feature.geometry?.type === 'MultiLineString'
    ) {
      bySlug.set(feature.properties.slug, feature.geometry);
    }
  }
  return bySlug;
}

async function seed() {
  const { cities, dryRun } = parseArgs(process.argv.slice(2));
  const payload = await getPayload({ config });

  const bendGeometry = cities.includes('bend')
    ? await loadBendGeometry()
    : new Map<string, MultiLineString>();

  let created = 0;
  let updated = 0;
  let withGeometry = 0;

  for (const city of cities) {
    const trails = CITIES[city].mountainBikeTrails;
    payload.logger.info(`${city}: importing ${trails.length} trails`);

    for (const trail of trails) {
      const slug = slugForTrail(trail);
      const geom = city === 'bend' ? (bendGeometry.get(slug) ?? null) : null;
      const osmIds = trail.osmIds ?? null;

      if (geom) {
        withGeometry += 1;
      }

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
        // Payload types a `json` field as an open-ended JSON value, so the
        // precise GeoJSON shape has to be widened at this boundary.
        geom: geom as Trail['geom'],
        // Only Bend's trails are OSM-derived and can be rebuilt from way ids.
        geometrySource: (osmIds?.length ? 'osm' : 'imported') as
          | 'imported'
          | 'osm',
        kind: kindFor(trail),
        osmIds: osmIds as Trail['osmIds'],
        rating: ratingFor(trail),
        recArea: trail.recArea,
        slug: trail.slug ?? null,
        trailName: trail.trailName,
      };

      if (dryRun) {
        continue;
      }

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

      // skipOsmRebuild keeps this import off the Overpass API entirely.
      if (existing.docs.length > 0) {
        await payload.update({
          collection: 'trails',
          context: { skipOsmRebuild: true },
          data,
          id: existing.docs[0].id,
        });
        updated += 1;
      } else {
        await payload.create({
          collection: 'trails',
          context: { skipOsmRebuild: true },
          data,
        });
        created += 1;
      }
    }
  }

  payload.logger.info(
    dryRun
      ? 'Dry run — nothing written.'
      : `Created ${created}, updated ${updated}. ${withGeometry} have geometry.`,
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
