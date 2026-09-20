interface BuildEnvironment {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  VERCEL_ENV?: string;
}

/**
 * Preview and development deployments share the global database with
 * production, so only the production Vercel build may change its schema.
 * Non-Vercel hosts keep the existing migrate-then-build behavior.
 */
export function shouldRunMigrations(environment: BuildEnvironment): boolean {
  if (!environment.DATABASE_URL) {
    return false;
  }
  return !environment.VERCEL_ENV || environment.VERCEL_ENV === 'production';
}
