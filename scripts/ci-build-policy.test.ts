import { describe, expect, it } from 'vitest';
import { shouldRunMigrations } from './ci-build-policy';

describe('shouldRunMigrations', () => {
  it('runs committed migrations for production Vercel builds', () => {
    expect(
      shouldRunMigrations({
        DATABASE_URL: 'postgres://pooled',
        VERCEL_ENV: 'production',
      }),
    ).toBe(true);
  });

  it.each([
    'preview',
    'development',
  ])('does not migrate the shared database from a %s Vercel build', (VERCEL_ENV) => {
    expect(
      shouldRunMigrations({ DATABASE_URL: 'postgres://pooled', VERCEL_ENV }),
    ).toBe(false);
  });

  it('keeps migrate-then-build behavior on non-Vercel hosts', () => {
    expect(shouldRunMigrations({ DATABASE_URL: 'postgres://local' })).toBe(
      true,
    );
  });

  it('skips migrations when there is no database', () => {
    expect(shouldRunMigrations({ VERCEL_ENV: 'production' })).toBe(false);
  });
});
