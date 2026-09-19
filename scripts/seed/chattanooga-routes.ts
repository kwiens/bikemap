/** Sync Chattanooga routes that still explicitly use Mapbox Studio geometry. */
import { chattanoogaData } from '../../src/data/cities/chattanooga';
import { connect, parseArgs, run } from './shared';
import { upsertStudioRoute } from './routes';

const IMPORTED_ROUTE_IDS = new Set(['riverwalk-loop-v3-public']);

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const payload = await connect();
  const routes = chattanoogaData.bikeRoutes.filter(
    (route) => !IMPORTED_ROUTE_IDS.has(route.id),
  );

  if (dryRun) {
    payload.logger.info(
      `chattanooga routes: validated ${routes.length}; dry run — nothing written.`,
    );
    return;
  }

  const results = await Promise.all(
    routes.map((route) =>
      upsertStudioRoute(payload, { city: 'chattanooga', route }),
    ),
  );
  const created = results.filter((result) => result === 'created').length;
  const updated = results.filter((result) => result === 'updated').length;
  const preserved = results.filter((result) => result === 'preserved').length;
  const unchanged = results.length - created - updated - preserved;
  payload.logger.info(
    `chattanooga routes: created ${created}, updated ${updated}, unchanged ${unchanged}, kept ${preserved} migrated.`,
  );
});
