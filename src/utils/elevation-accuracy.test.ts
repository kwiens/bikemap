import { describe, it, expect } from 'vitest';
import { computeElevation } from './ride-stats';
import type { RidePoint } from '../data/ride';

// Real GPS altitude data extracted from paired Strava + BikeChatt GPX recordings
// of the same rides. Strava uses terrain-corrected elevation (DEM), so its values
// serve as ground truth for what the elevation gain should be.
import ride1StravaAlts from './test-data/ride1_mtb_strava_alts.json';
import ride1BcAlts from './test-data/ride1_mtb_bikechatt_alts.json';
import ride2StravaAlts from './test-data/ride2_casual_strava_alts.json';
import ride2BcAlts from './test-data/ride2_casual_bikechatt_alts.json';
import ride3StravaAlts from './test-data/ride3_casual_strava_alts.json';
import ride3BcAlts from './test-data/ride3_casual_bikechatt_alts.json';

/** Convert an altitude array into RidePoints for computeElevation */
function altsToPoints(alts: number[]): RidePoint[] {
  return alts.map((alt, i) => ({
    lng: -85.3 + i * 0.0001,
    lat: 35.05 + i * 0.0001,
    altitude: alt,
    accuracy: 5,
    speed: 3,
    timestamp: 1700000000000 + i * 1000,
  }));
}

/** Compute Strava reference gain from their terrain-corrected data */
function stravaGain(alts: number[]): number {
  return computeElevation(altsToPoints(alts)).gain;
}

describe('elevation accuracy vs Strava (real GPS data)', () => {
  // Strava reference values computed from their terrain-corrected altitude data
  const strava = {
    ride1: stravaGain(ride1StravaAlts),
    ride2: stravaGain(ride2StravaAlts),
    ride3: stravaGain(ride3StravaAlts),
  };

  it('Ride 1 (MTB): elevation gain within 3x of Strava', () => {
    const { gain } = computeElevation(altsToPoints(ride1BcAlts));
    // Strava reports ~33m for this ride. MTB rides have noisier GPS altitude
    // (tree cover, rough terrain). Without DEM correction, 3x is the best
    // we can achieve. Previously this was 3.4x with the old algorithm.
    expect(gain).toBeLessThan(strava.ride1 * 3);
    expect(gain).toBeGreaterThan(strava.ride1 * 0.5);
  });

  it('Ride 2 (casual): elevation gain within 1.5x of Strava', () => {
    const { gain } = computeElevation(altsToPoints(ride2BcAlts));
    // Casual rides have less GPS noise; should be closer to Strava
    expect(gain).toBeLessThan(strava.ride2 * 1.5);
    expect(gain).toBeGreaterThan(strava.ride2 * 0.5);
  });

  it('Ride 3 (casual): elevation gain within 3x of Strava', () => {
    const { gain } = computeElevation(altsToPoints(ride3BcAlts));
    // This flat ride (Strava: ~6m) is hardest to match without DEM
    expect(gain).toBeLessThan(strava.ride3 * 3);
  });

  it('BikeChatt GPS data is noisier than Strava corrected data', () => {
    // Sanity check: BikeChatt raw GPS altitude should show more jitter
    // than Strava's terrain-corrected values
    function avgJitter(alts: number[]): number {
      let sum = 0;
      for (let i = 1; i < alts.length; i++)
        sum += Math.abs(alts[i] - alts[i - 1]);
      return sum / (alts.length - 1);
    }
    expect(avgJitter(ride1BcAlts)).toBeGreaterThan(avgJitter(ride1StravaAlts));
    expect(avgJitter(ride2BcAlts)).toBeGreaterThan(avgJitter(ride2StravaAlts));
  });

  it('live recording does not exceed 2x the post-ride result', () => {
    // Post-ride uses forward-backward EMA (centered, no lag) while live uses
    // single-pass EMA (causal, has lag). Live will report more gain due to
    // phase lag, but should never exceed 2x the post-ride value.
    for (const alts of [ride1BcAlts, ride2BcAlts, ride3BcAlts]) {
      const postRide = computeElevation(altsToPoints(alts)).gain;
      const live = simulateLiveElevation(alts);
      expect(live).toBeLessThan(postRide * 2);
    }
  });
});

/**
 * Simulate the live recording elevation algorithm from useRideRecording.
 * Must stay in sync with the actual hook implementation (EMA + deadband).
 */
function simulateLiveElevation(alts: number[]): number {
  const EMA_ALPHA = 0.1;
  const DEADBAND = 3;
  let ema: number | null = null;
  let anchor: number | null = null;
  let gain = 0;

  for (const a of alts) {
    if (ema === null) {
      ema = a;
      anchor = a;
      continue;
    }
    ema = EMA_ALPHA * a + (1 - EMA_ALPHA) * ema;
    const delta = ema - anchor!;
    if (delta > DEADBAND) {
      gain += delta;
      anchor = ema;
    } else if (delta < -DEADBAND) {
      anchor = ema;
    }
  }
  return gain;
}
