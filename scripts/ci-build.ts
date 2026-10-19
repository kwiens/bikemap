import { spawnSync } from 'node:child_process';
import { shouldRunMigrations } from './ci-build-policy';

if (shouldRunMigrations(process.env)) {
  runPnpm('db:migrate');
  // Bend route geometry derives from a committed source, so production can
  // safely sync these eight rows after the schema is current. The importer
  // skips unchanged rows and therefore does not create a version per deploy.
  runPnpm('db:seed:bend-routes');
  // Keep the five Chattanooga routes that have not yet been migrated in the
  // database-backed Casual list. Their geometry source remains explicitly
  // Studio; imported, trail-linked, or composed replacements are preserved.
  runPnpm('db:seed:chattanooga-routes');
} else if (process.env.DATABASE_URL && process.env.VERCEL_ENV) {
  console.log(
    `Skipping Payload migrations in the ${process.env.VERCEL_ENV} Vercel environment; previews need an isolated database and PREVIEW_DATABASE_ISOLATED=true before they may migrate.`,
  );
} else {
  console.log('DATABASE_URL is not set; skipping Payload migrations.');
}

runPnpm('build');

function runPnpm(script: string): void {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(executable, [script], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
