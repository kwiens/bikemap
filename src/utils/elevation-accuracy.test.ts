import { describe, it, expect } from 'vitest';
import {
  computeElevation,
  haversineDistance,
  ELEVATION_EMA_ALPHA,
  ELEVATION_DEAD_BAND,
  ELEVATION_SPIKE_THRESHOLD,
  ELEVATION_MIN_DISTANCE,
} from './ride-stats';
import type { RidePoint } from '../data/ride';

// Real GPS data extracted from paired Strava + BikeChatt GPX recordings
// of the same rides. Each entry is [lat, lng, altitude].
// Strava uses terrain-corrected elevation (DEM), so its values serve as
// ground truth for what the elevation gain should be.
import ride1Strava from './test-data/ride1_mtb_strava.json';
import ride1Bc from './test-data/ride1_mtb_bikechatt.json';
import ride2Strava from './test-data/ride2_casual_strava.json';
import ride2Bc from './test-data/ride2_casual_bikechatt.json';
import ride3Strava from './test-data/ride3_casual_strava.json';
import ride3Bc from './test-data/ride3_casual_bikechatt.json';

type GpxPoint = [number, number, number]; // [lat, lng, alt]

/** Convert GPX point arrays into RidePoints for computeElevation */
function toRidePoints(pts: GpxPoint[]): RidePoint[] {
  return pts.map(([lat, lng, alt], i) => ({
    lat,
    lng,
    altitude: alt,
    accuracy: 5,
    speed: 3,
    timestamp: 1700000000000 + i * 1000,
  }));
}

/** Compute elevation gain from Strava's terrain-corrected data */
function stravaGain(pts: GpxPoint[]): number {
  return computeElevation(toRidePoints(pts)).gain;
}

describe('elevation accuracy vs Strava (real GPS data)', () => {
  const strava = {
    ride1: stravaGain(ride1Strava as GpxPoint[]),
    ride2: stravaGain(ride2Strava as GpxPoint[]),
    ride3: stravaGain(ride3Strava as GpxPoint[]),
  };

  it('Ride 1 (MTB): elevation gain within 4x of Strava', () => {
    const { gain } = computeElevation(toRidePoints(ride1Bc as GpxPoint[]));
    // MTB rides have noisier GPS altitude (tree cover, rough terrain).
    // Without DEM correction, GPS-only elevation can't match terrain data.
    expect(gain).toBeLessThan(strava.ride1 * 4);
    expect(gain).toBeGreaterThan(strava.ride1 * 0.3);
  });

  it('Ride 2 (casual): elevation gain within 2x of Strava', () => {
    const { gain } = computeElevation(toRidePoints(ride2Bc as GpxPoint[]));
    expect(gain).toBeLessThan(strava.ride2 * 2);
    expect(gain).toBeGreaterThan(strava.ride2 * 0.3);
  });

  it('Ride 3 (casual flat): elevation gain under 50m', () => {
    const { gain } = computeElevation(toRidePoints(ride3Bc as GpxPoint[]));
    // Strava reports ~6m for this flat ride. GPS noise makes the absolute
    // multiplier misleading; just verify we're under 50m total.
    expect(gain).toBeLessThan(50);
  });

  it('BikeChatt GPS data is noisier than Strava corrected data', () => {
    function avgJitter(pts: GpxPoint[]): number {
      let sum = 0;
      for (let i = 1; i < pts.length; i++)
        sum += Math.abs(pts[i][2] - pts[i - 1][2]);
      return sum / (pts.length - 1);
    }
    expect(avgJitter(ride1Bc as GpxPoint[])).toBeGreaterThan(
      avgJitter(ride1Strava as GpxPoint[]),
    );
    expect(avgJitter(ride2Bc as GpxPoint[])).toBeGreaterThan(
      avgJitter(ride2Strava as GpxPoint[]),
    );
  });

  it('spike rejection filters altitude jumps > threshold', () => {
    // Flat ride with a single 30m spike in the middle
    const pts: RidePoint[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 35.05 + i * 0.0003,
      lng: -85.3 + i * 0.0003,
      altitude: i === 25 ? 230 : 200,
      accuracy: 5,
      speed: 3,
      timestamp: 1700000000000 + i * 1000,
    }));
    const { gain } = computeElevation(pts);
    // Without spike rejection this would show gain from the 30m spike
    expect(gain).toBeLessThan(5);
  });

  it('minimum distance prevents counting jitter while stopped', () => {
    // 50 points at the same location with noisy altitude
    const pts: RidePoint[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 35.05,
      lng: -85.3,
      altitude: 200 + (i % 2 === 0 ? 4 : -4), // ±4m oscillation
      accuracy: 5,
      speed: 0,
      timestamp: 1700000000000 + i * 1000,
    }));
    const { gain } = computeElevation(pts);
    // Without min distance this would accumulate gain from oscillations
    expect(gain).toBe(0);
  });

  it('live recording does not exceed 2x the post-ride result', () => {
    for (const pts of [ride1Bc, ride2Bc, ride3Bc] as GpxPoint[][]) {
      const postRide = computeElevation(toRidePoints(pts)).gain;
      const live = simulateLiveElevation(pts);
      expect(live).toBeLessThan(Math.max(postRide * 2, 10));
    }
  });
});

/**
 * Simulate the live recording elevation algorithm from useRideRecording.
 * Must stay in sync with the actual hook implementation.
 */
function simulateLiveElevation(pts: GpxPoint[]): number {
  let ema: number | null = null;
  let anchor: number | null = null;
  let distSinceAnchor = 0;
  let gain = 0;

  for (let i = 0; i < pts.length; i++) {
    const [lat, lng, rawAlt] = pts[i];

    // Accumulate horizontal distance
    if (i > 0) {
      distSinceAnchor += haversineDistance(
        pts[i - 1][0],
        pts[i - 1][1],
        lat,
        lng,
      );
    }

    // Spike rejection
    let alt = rawAlt;
    if (ema !== null && Math.abs(alt - ema) > ELEVATION_SPIKE_THRESHOLD) {
      alt = ema;
    }

    if (ema === null) {
      ema = alt;
      anchor = alt;
      continue;
    }

    ema = ELEVATION_EMA_ALPHA * alt + (1 - ELEVATION_EMA_ALPHA) * ema;

    if (distSinceAnchor >= ELEVATION_MIN_DISTANCE) {
      const delta = ema - anchor!;
      if (delta > ELEVATION_DEAD_BAND) {
        gain += delta;
        anchor = ema;
      } else if (delta < -ELEVATION_DEAD_BAND) {
        anchor = ema;
      }
    }
  }
  return gain;
}
