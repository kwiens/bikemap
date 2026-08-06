/**
 * Seeds Chattanooga's trails into Payload.
 *
 *   pnpm db:seed:chattanooga
 *   pnpm db:seed:chattanooga --dry-run
 *
 * **Not run by default.** Chattanooga doesn't fit the OSM-referenced model yet,
 * and importing it would put several hundred rows in the database that the
 * editor can't meaningfully work on. Run it deliberately when you want them.
 *
 * The difference from Bend is the whole reason these are separate scripts:
 *
 *   - No `osmIds`. Its trails have never been matched to OSM ways, so nothing
 *     here can be rebuilt from OSM. Whether they *can* be matched is the open
 *     question in ADR-0001 — `scripts/align_bend_geometry.py` against Tennessee
 *     is the experiment that would answer it.
 *   - No geometry. Its lines live in a Mapbox Studio tileset, which the map
 *     renders directly; there is no GeoJSON in the repo to import.
 *
 * So these import as `geometrySource: 'imported'`: metadata only, and the OSM
 * rebuild hook leaves them alone. Once a trail has been matched to way ids, set
 * its source to 'osm' and it starts being maintained from OSM like Bend's.
 *
 * Re-running is safe: rows match on (trailName, city) and update.
 */
import { chattanoogaData } from '../../src/data/cities/chattanooga';
import { connect, parseArgs, report, run, upsertTrail } from './shared';

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const payload = await connect();

  const trails = chattanoogaData.mountainBikeTrails;
  payload.logger.info(
    `chattanooga: importing ${trails.length} trails (metadata only — geometry stays in the Mapbox tileset)`,
  );

  let created = 0;
  let updated = 0;

  for (const trail of trails) {
    if (dryRun) {
      continue;
    }

    const result = await upsertTrail(payload, {
      city: 'chattanooga',
      geom: null,
      geometrySource: 'imported',
      trail,
    });
    if (result === 'created') {
      created += 1;
    } else {
      updated += 1;
    }
  }

  report(payload, 'chattanooga', { created, updated, withGeometry: 0 }, dryRun);
});
