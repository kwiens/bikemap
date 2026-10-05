import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { getBundledElevationProfile } from './bundled-elevation';

const PROFILE: ElevationProfile = {
  distance: 153,
  gain: 16,
  loss: 12,
  max: 952,
  min: 940,
  profile: [
    [0, 943, -85.300307, 35.120872],
    [153, 947, -85.300491, 35.12061],
  ],
  trail: 'Godsey Ridge Expert Spur',
};

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('getBundledElevationProfile', () => {
  it('loads and validates the city-scoped profile from the canonical site', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(PROFILE),
    ) as typeof fetch;

    await expect(
      getBundledElevationProfile('chattanooga', 'godsey-ridge-expert-spur'),
    ).resolves.toEqual(PROFILE);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL(
        'https://bikechatt.com/data/elevation/chattanooga/godsey-ridge-expert-spur.json',
      ),
      { cache: 'no-store' },
    );
  });

  it('returns null for a missing or malformed fallback', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ profile: [] })) as typeof fetch;

    await expect(
      getBundledElevationProfile('bend', 'missing'),
    ).resolves.toBeNull();
    await expect(
      getBundledElevationProfile('bend', 'malformed'),
    ).resolves.toBeNull();
  });
});
