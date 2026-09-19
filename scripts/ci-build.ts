import { spawnSync } from 'node:child_process';

if (process.env.DATABASE_URL) {
  runPnpm('db:migrate');
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
