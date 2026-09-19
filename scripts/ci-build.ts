import { spawnSync } from 'node:child_process';
import { shouldRunMigrations } from './ci-build-policy';

if (shouldRunMigrations(process.env)) {
  runPnpm('db:migrate');
} else if (process.env.DATABASE_URL && process.env.VERCEL_ENV) {
  console.log(
    `Skipping Payload migrations in the ${process.env.VERCEL_ENV} Vercel environment; only production may migrate the shared database.`,
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
