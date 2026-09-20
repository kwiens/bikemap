import { describe, expect, it } from 'vitest';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { parseElevationProfile } from './elevation-profile';

const PROFILE: ElevationProfile = {
  distance: 100,
  gain: 20,
  loss: 10,
  max: 1020,
  min: 1000,
  profile: [
    [0, 1000, -85.3, 35.1],
    [100, 1020, -85.29, 35.11],
  ],
  trail: 'Test Trail',
};

describe('parseElevationProfile', () => {
  it('accepts a complete profile', () => {
    expect(parseElevationProfile(PROFILE)).toEqual(PROFILE);
  });

  it('rejects a malformed summary value', () => {
    expect(parseElevationProfile({ ...PROFILE, gain: '20' })).toBeNull();
  });

  it('checks every point rather than only the first', () => {
    expect(
      parseElevationProfile({
        ...PROFILE,
        profile: [PROFILE.profile[0], [100, null, -85.29, 35.11]],
      }),
    ).toBeNull();
  });

  it('rejects malformed geometry gap details', () => {
    expect(
      parseElevationProfile({
        ...PROFILE,
        geometryGapDetails: [{ feet: 20, from: null, to: [-85.2, 35.2] }],
      }),
    ).toBeNull();
  });
});
