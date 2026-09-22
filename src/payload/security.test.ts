import { describe, expect, it } from 'vitest';
import {
  payloadCsrfOrigins,
  payloadSecret,
  requirePayloadSecret,
} from './security';

describe('requirePayloadSecret', () => {
  it('accepts a high-entropy-sized secret', () => {
    expect(requirePayloadSecret('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('rejects missing and short secrets', () => {
    expect(() => requirePayloadSecret(undefined)).toThrow('at least 32 bytes');
    expect(() => requirePayloadSecret('too-short')).toThrow(
      'at least 32 bytes',
    );
  });
});

describe('payloadSecret', () => {
  it('fails closed in production and deployed environments', () => {
    expect(() => payloadSecret({ NODE_ENV: 'production' })).toThrow(
      'at least 32 bytes',
    );
    expect(() =>
      payloadSecret({ NODE_ENV: 'test', VERCEL_ENV: 'preview' }),
    ).toThrow('at least 32 bytes');
  });

  it('provides a local-only value when static tooling does not load env files', () => {
    expect(payloadSecret({ NODE_ENV: 'test' })).toHaveLength(41);
  });
});

describe('payloadCsrfOrigins', () => {
  it('includes canonical, hostname-map, and Vercel deployment origins', () => {
    const origins = payloadCsrfOrigins({
      NODE_ENV: 'production',
      NEXT_PUBLIC_CITY_HOST_MAP: JSON.stringify({
        'map.example.org': 'chattanooga',
      }),
      VERCEL_URL: 'bikemap-deployment.vercel.app',
      VERCEL_BRANCH_URL: 'bikemap-feature.vercel.app',
    });

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://bikechatt.com',
        'https://www.bikechatt.com',
        'https://ridebend.org',
        'https://www.ridebend.org',
        'https://map.example.org',
        'https://bikemap-deployment.vercel.app',
        'https://bikemap-feature.vercel.app',
      ]),
    );
    expect(origins).not.toContain('http://localhost:3000');
  });

  it('allows local admin development without opening production', () => {
    expect(payloadCsrfOrigins({ NODE_ENV: 'development' })).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ]),
    );
  });

  it('drops malformed environment-derived origins', () => {
    const origins = payloadCsrfOrigins({
      NODE_ENV: 'production',
      NEXT_PUBLIC_CITY_HOST_MAP: JSON.stringify({
        'good.example.org': 'bend',
        'evil.example.org/path': 'bend',
      }),
      VERCEL_URL: 'evil.example.org;script-src-none',
    });

    expect(origins).toContain('https://good.example.org');
    expect(origins).not.toContain('https://evil.example.org/path');
    expect(origins).not.toContain('https://evil.example.org;script-src-none');
  });
});
