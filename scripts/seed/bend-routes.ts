/** Sync Bend's eight database-owned Casual routes without reseeding trails. */
import { connect, parseArgs, run } from './shared';
import { loadBendRoutes } from './bend-route-data';
import { upsertImportedRoute } from './routes';

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const payload = await connect();
  const routes = await loadBendRoutes();

  if (dryRun) {
    payload.logger.info(
      `bend routes: validated ${routes.length}; dry run — nothing written.`,
    );
    return;
  }

  const results = await Promise.all(
    routes.map((route) => upsertImportedRoute(payload, route)),
  );
  const created = results.filter((result) => result === 'created').length;
  const updated = results.filter((result) => result === 'updated').length;
  const preserved = results.filter((result) => result === 'preserved').length;
  const unchanged = results.length - created - updated - preserved;
  payload.logger.info(
    `bend routes: created ${created}, updated ${updated}, unchanged ${unchanged}, kept ${preserved} trail-linked.`,
  );
});
