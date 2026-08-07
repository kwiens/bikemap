/**
 * Generates the stored elevation profile for every trail that has geometry.
 *
 * The elevation pane reads `/api/map/elevation/<slug>`, which serves what a
 * trail last measured on save. A trail seeded from the checked-in data has
 * never been through that path — the seed writes `context.skipOsmRebuild`, on
 * purpose, so a few hundred rows don't fire a few hundred Overpass requests —
 * so it has stats but no profile, and no chart.
 *
 * This fills them in **without touching Overpass**: the geometry is already in
 * the database, so only the terrain needs sampling. That makes it safe to run
 * over every trail at once, and safe to re-run.
 *
 * It rewrites the derived stats from the same measurement, deliberately. The
 * pane's headline numbers come from the profile and the sidebar's come from the
 * row, so measuring one without the other leaves a trail showing two different
 * climb figures. Expect the numbers to move: the checked-in ones came from
 * `add_trail_elevation.py`, which accumulates raw sample-to-sample deltas with
 * no smoothing, and reads roughly 15% more climbing and 25% more descent than
 * the dead-banded maths used here.
 *
 *   pnpm backfill:elevation -- --dry-run
 *   pnpm backfill:elevation
 *   pnpm backfill:elevation -- --city=chattanooga --force
 */
import { getPayload } from 'payload';
import config from '../src/payload.config';
import type { CityId } from '../src/data/cities/types';
import { parseTrailGeometry } from '../src/payload/osm/geometry';
import { measureParts } from '../src/payload/osm/measure';
import type { Trail } from '../src/payload-types';

interface Options {
  city: CityId;
  dryRun: boolean;
  /** Re-measure trails that already have a profile. */
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const city = argv.find((arg) => arg.startsWith('--city='))?.split('=')[1];
  return {
    city: city === 'chattanooga' ? 'chattanooga' : 'bend',
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

async function main() {
  const { city, dryRun, force } = parseArgs(process.argv.slice(2));
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'NEXT_PUBLIC_MAPBOX_TOKEN is required — elevation comes from Mapbox Terrain-RGB.',
    );
  }

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'trails',
    depth: 0,
    limit: 5000,
    pagination: false,
    where: { city: { equals: city } },
  });

  const todo = result.docs.filter(
    (trail) => trail.geom && (force || !trail.elevationProfile),
  );

  payload.logger.info(
    `${city}: ${result.docs.length} trails, ${todo.length} to measure` +
      `${dryRun ? ' (dry run — nothing will be written)' : ''}`,
  );

  let measured = 0;
  let noTerrain = 0;
  let noGeometry = 0;

  for (const trail of todo) {
    const parsed = parseTrailGeometry(trail.geom);
    if (!parsed.ok || parsed.parts.length === 0) {
      noGeometry += 1;
      payload.logger.warn(
        `${trail.displayName}: geometry could not be read — ${parsed.error ?? 'no parts'}`,
      );
      continue;
    }

    const name = trail.displayName ?? trail.trailName ?? 'Trail';
    const stats = await measureParts(parsed.parts, name, {
      mapboxToken: token,
    });

    if (!stats.profile) {
      // Distance is still valid, but with no terrain there is no chart — and
      // overwriting good stats with nulls would be worse than leaving them.
      noTerrain += 1;
      payload.logger.warn(`${name}: no terrain could be read; left as it was.`);
      continue;
    }

    measured += 1;
    if (dryRun) {
      continue;
    }

    await payload.update({
      collection: 'trails',
      // Without this the beforeChange hook refetches the ways from Overpass —
      // a few hundred requests at a shared community endpoint, for geometry
      // that is already sitting in the row.
      context: { skipOsmRebuild: true },
      data: {
        bounds: stats.bounds,
        distance: stats.distance,
        elevationGain: stats.elevationGain,
        elevationLoss: stats.elevationLoss,
        elevationMax: stats.elevationMax,
        elevationMin: stats.elevationMin,
        // Payload types a `json` field as an open-ended JSON value, so the
        // profile's precise shape has to be widened at this boundary.
        elevationProfile: stats.profile as unknown as Trail['elevationProfile'],
      },
      id: trail.id,
    });
  }

  payload.logger.info(
    `${city}: measured ${measured}` +
      (noTerrain ? `, ${noTerrain} without terrain` : '') +
      (noGeometry ? `, ${noGeometry} without usable geometry` : '') +
      (dryRun ? ' — dry run, nothing written.' : '.'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
