/**
 * Seeds Chattanooga's trails into Payload.
 *
 *   pnpm db:seed:chattanooga
 *   pnpm db:seed:chattanooga --dry-run
 *
 * **Not run by default.** Chattanooga still does not fit the OSM-referenced
 * model: its trails have no OSM way ids. Run this deliberately when you want
 * to import its curated metadata and the archived regional GIS geometry.
 *
 * The difference from Bend is the whole reason these are separate scripts:
 *
 *   - No `osmIds`. Its trails have never been matched to OSM ways, so nothing
 *     here can be rebuilt from OSM. Whether they *can* be matched is the open
 *     question in ADR-0001 — `scripts/align_bend_geometry.py` against Tennessee
 *     is the experiment that would answer it.
 *   - Geometry comes from public/data/chattanooga/trails.geojson, generated
 *     from the permitted regional-trails shapefile by
 *     scripts/prepare_chattanooga_trails.py and matched by raw `Trail` name.
 *     Summary measurements and static profiles are regenerated from those
 *     exact lines by scripts/prepare_chattanooga_measurements.ts, and the seed
 *     imports the profile with the line so no legacy measurement can leak in.
 *
 * These import as `geometrySource: 'imported'`, so the OSM rebuild hook leaves
 * the archived line alone. Once a trail has been matched to way ids, set its
 * source to 'osm' and it starts being maintained from OSM like Bend's.
 *
 * Re-running is safe: rows match on (trailName, city) and update, and a trail
 * whose line was drawn in the admin keeps it — see `upsertTrail`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chattanoogaData } from '../../src/data/cities/chattanooga';
import {
  type ElevationProfile,
  slugForTrail,
} from '../../src/data/mountain-bike-trails';
import {
  connect,
  parseArgs,
  report,
  repoRoot,
  run,
  emptyVocabulary,
  loadVocabulary,
  upsertArea,
  upsertTrail,
  type MultiLineString,
} from './shared';

const GEOJSON = 'public/data/chattanooga/trails.geojson';
const PROFILE_DIR = 'public/data/elevation/chattanooga';

/** Raw `Trail` value -> imported MultiLineString. */
async function loadGeometry(): Promise<Map<string, MultiLineString>> {
  const raw = await readFile(path.join(repoRoot, GEOJSON), 'utf8');
  const collection = JSON.parse(raw) as {
    features: {
      geometry: MultiLineString;
      properties: { Trail?: string };
    }[];
  };

  const byName = new Map<string, MultiLineString>();
  for (const feature of collection.features) {
    if (
      feature.properties.Trail &&
      feature.geometry?.type === 'MultiLineString'
    ) {
      byName.set(feature.properties.Trail, feature.geometry);
    }
  }
  return byName;
}

async function loadProfile(slug: string): Promise<ElevationProfile> {
  const filename = path.join(repoRoot, PROFILE_DIR, `${slug}.json`);
  const raw = await readFile(filename, 'utf8');
  const profile = JSON.parse(raw) as ElevationProfile;
  if (!Array.isArray(profile.profile) || profile.profile.length === 0) {
    throw new Error(`Invalid Chattanooga elevation profile: ${filename}`);
  }
  return profile;
}

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const payload = await connect();

  const geometry = await loadGeometry();
  const trails = chattanoogaData.mountainBikeTrails;
  const profiles = new Map(
    await Promise.all(
      trails
        .filter((trail) => geometry.has(trail.trailName))
        .map(
          async (trail) =>
            [trail.trailName, await loadProfile(slugForTrail(trail))] as const,
        ),
    ),
  );
  payload.logger.info(
    `chattanooga: importing ${trails.length} trails (${geometry.size} source geometries; ${profiles.size} curated trails have measured profiles)`,
  );

  // Areas are created on first mention; the cache keeps that to one
  // lookup per area rather than one per trail.
  const areas = new Map<string, number>();
  // Ratings and kinds are collections now, so resolve them once up front rather
  // than looking each up per trail. Skipped for a dry run, which must not write
  // anything — and nothing reads it on that path.
  const vocabulary = dryRun ? emptyVocabulary() : await loadVocabulary(payload);
  let created = 0;
  let updated = 0;
  let withGeometry = 0;
  const missingGeometry: string[] = [];
  const preserved: string[] = [];

  for (const trail of trails) {
    const geom = geometry.get(trail.trailName) ?? null;
    if (geom) {
      withGeometry += 1;
    } else {
      missingGeometry.push(trail.trailName);
    }

    if (dryRun) {
      continue;
    }

    const areaId = await upsertArea(
      payload,
      'chattanooga',
      trail.recArea,
      chattanoogaData.regionFor(trail.recArea),
      areas,
    );

    const result = await upsertTrail(payload, {
      areaId,
      vocabulary,
      city: 'chattanooga',
      elevationProfile: profiles.get(trail.trailName) ?? null,
      geom,
      geometrySource: 'imported',
      trail,
    });
    if (result === 'created') {
      created += 1;
    } else {
      updated += 1;
      if (result === 'preserved') {
        preserved.push(trail.trailName);
      }
    }
  }

  report(
    payload,
    'chattanooga',
    { created, preserved, updated, withGeometry },
    dryRun,
  );

  if (missingGeometry.length > 0) {
    payload.logger.warn(
      `chattanooga: ${missingGeometry.length} trails had no geometry in ${GEOJSON}: ${missingGeometry
        .slice(0, 10)
        .join(', ')}${missingGeometry.length > 10 ? ', …' : ''}`,
    );
  }
});
