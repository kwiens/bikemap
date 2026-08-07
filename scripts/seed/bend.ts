/**
 * Seeds Bend's trails into Payload.
 *
 *   pnpm db:seed:bend
 *   pnpm db:seed:bend --dry-run
 *
 * Bend is the city that fits the OSM-referenced model end to end. Its trails
 * were built from OSM ways by scripts/build_bend_trails.py, so they carry
 * `osmIds` and real geometry — which means they import as
 * `geometrySource: 'osm'` and can later be rebuilt from OSM by ticking
 * "Rebuild geometry" in the admin.
 *
 * Geometry comes from public/data/bend/trails.geojson, matched by slug. That
 * file is the same one the map used to read directly, so seeding from it means
 * the database starts out rendering exactly what the static file did.
 *
 * Re-running is safe: rows match on (trailName, city) and update.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bendData } from '../../src/data/cities/bend';
import { slugForTrail } from '../../src/data/mountain-bike-trails';
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

const GEOJSON = 'public/data/bend/trails.geojson';

/** slug -> MultiLineString, read once from the generated GeoJSON. */
async function loadGeometry(): Promise<Map<string, MultiLineString>> {
  const raw = await readFile(path.join(repoRoot, GEOJSON), 'utf8');
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

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const payload = await connect();

  const geometry = await loadGeometry();
  const trails = bendData.mountainBikeTrails;
  payload.logger.info(
    `bend: importing ${trails.length} trails (${geometry.size} geometries in ${GEOJSON})`,
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

  for (const trail of trails) {
    const geom = geometry.get(slugForTrail(trail)) ?? null;
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
      'bend',
      trail.recArea,
      bendData.regionFor(trail.recArea),
      areas,
    );

    const result = await upsertTrail(payload, {
      areaId,
      vocabulary,
      city: 'bend',
      geom,
      // Only trails that actually reference OSM ways can be rebuilt from them.
      geometrySource: trail.osmIds?.length ? 'osm' : 'imported',
      trail,
    });
    if (result === 'created') {
      created += 1;
    } else {
      updated += 1;
    }
  }

  report(payload, 'bend', { created, updated, withGeometry }, dryRun);

  if (missingGeometry.length > 0) {
    payload.logger.warn(
      `bend: ${missingGeometry.length} trails had no geometry in ${GEOJSON}: ${missingGeometry
        .slice(0, 10)
        .join(', ')}${missingGeometry.length > 10 ? ', …' : ''}`,
    );
  }
});
