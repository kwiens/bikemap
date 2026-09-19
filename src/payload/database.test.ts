import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from './database';

describe('resolveDatabaseUrl', () => {
  it('uses the pooled connection for application traffic', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgres://pooled',
        DATABASE_URL_UNPOOLED: 'postgres://direct',
      }),
    ).toBe('postgres://pooled');
  });

  it('uses the direct connection for migrations', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgres://pooled',
        DATABASE_URL_UNPOOLED: 'postgres://direct',
        PAYLOAD_MIGRATING: 'true',
      }),
    ).toBe('postgres://direct');
  });

  it('falls back to the runtime URL for a local migration', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgres://local',
        PAYLOAD_MIGRATING: 'true',
      }),
    ).toBe('postgres://local');
  });

  it('allows database-free builds', () => {
    expect(resolveDatabaseUrl({})).toBe('');
  });

  it('keeps full TLS verification explicit for managed connections', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL:
          'postgresql://user:password@example.com/app?sslmode=require',
      }),
    ).toBe('postgresql://user:password@example.com/app?sslmode=verify-full');
  });
});
