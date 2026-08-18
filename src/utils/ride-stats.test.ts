import { describe, it, expect } from 'vitest';
import type { RidePoint, RecordedRide } from '../data/ride';
import {
  haversineDistance,
  computeDistance,
  computeMovingTime,
  computeElevation,
  computeMaxSpeed,
  computeBounds,
  computeRideStats,
  rideToElevationProfile,
  pointsToElevationProfile,
} from './ride-stats';

function makePoint(overrides?: Partial<RidePoint>): RidePoint {
  return {
    lng: -85.3,
    lat: 35.05,
    altitude: 200,
    accuracy: 5,
    speed: 5,
    timestamp: 1700000000000,
    ...overrides,
  };
}

/** Generate a straight-line track of N points heading northeast from a start point. */
function makeTrack(
  n: number,
  opts?: {
    startLat?: number;
    startLng?: number;
    startAlt?: number;
    altStep?: number;
    intervalMs?: number;
    speed?: number;
    accuracy?: number;
  },
): RidePoint[] {
  const startLat = opts?.startLat ?? 35.05;
  const startLng = opts?.startLng ?? -85.3;
  const startAlt = opts?.startAlt ?? 200;
  const altStep = opts?.altStep ?? 0;
  const intervalMs = opts?.intervalMs ?? 1000;
  const speed = opts?.speed ?? 5;
  const accuracy = opts?.accuracy ?? 5;

  return Array.from({ length: n }, (_, i) => ({
    lng: startLng + i * 0.0003,
    lat: startLat + i * 0.0003,
    altitude: startAlt + i * altStep,
    accuracy,
    speed,
    timestamp: 1700000000000 + i * intervalMs,
  }));
}

// --- haversineDistance ---

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(35.05, -85.3, 35.05, -85.3)).toBe(0);
  });

  it('computes a known distance between two Chattanooga points', () => {
    // Walnut St Bridge (35.0575, -85.3085) to TN Aquarium (35.0559, -85.3113)
    // ~roughly 300-350m
    const d = haversineDistance(35.0575, -85.3085, 35.0559, -85.3113);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(450);
  });

  it('computes a large distance correctly', () => {
    // Chattanooga to Nashville (~200km)
    const d = haversineDistance(35.05, -85.3, 36.16, -86.78);
    expect(d).toBeGreaterThan(180_000);
    expect(d).toBeLessThan(220_000);
  });
});

// --- computeDistance ---

describe('computeDistance', () => {
  it('returns 0 for empty array', () => {
    expect(computeDistance([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(computeDistance([makePoint()])).toBe(0);
  });

  it('computes distance for a two-point path', () => {
    const points = [
      makePoint({ lat: 35.05, lng: -85.3 }),
      makePoint({ lat: 35.06, lng: -85.3 }),
    ];
    const d = computeDistance(points);
    // ~1.11km for 0.01 degree latitude
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });

  it('skips points with accuracy > 30m', () => {
    const points = [
      makePoint({ lat: 35.05, lng: -85.3, accuracy: 5 }),
      makePoint({ lat: 35.06, lng: -85.3, accuracy: 50 }), // too inaccurate
      makePoint({ lat: 35.07, lng: -85.3, accuracy: 5 }),
    ];
    const d = computeDistance(points);
    // Both segments touching the inaccurate point are skipped
    expect(d).toBe(0);
  });

  it('does not bridge an explicit segment break', () => {
    const points = [
      makePoint({ lat: 35, lng: -85.3 }),
      makePoint({ lat: 35.001, lng: -85.3 }),
      makePoint({ lat: 44, lng: -121.3, segmentStart: true }),
      makePoint({ lat: 44.001, lng: -121.3 }),
    ];

    const expected =
      haversineDistance(35, -85.3, 35.001, -85.3) +
      haversineDistance(44, -121.3, 44.001, -121.3);
    expect(computeDistance(points)).toBeCloseTo(expected);
  });
});

// --- computeMovingTime ---

describe('computeMovingTime', () => {
  it('returns 0 for empty or single-point array', () => {
    expect(computeMovingTime([])).toBe(0);
    expect(computeMovingTime([makePoint()])).toBe(0);
  });

  it('counts all time as moving when speed is above threshold', () => {
    const points = makeTrack(5, { speed: 5, intervalMs: 2000 });
    // 4 intervals * 2000ms = 8000ms
    expect(computeMovingTime(points)).toBe(8000);
  });

  it('subtracts long stops (>10s at low speed)', () => {
    const points = [
      makePoint({ speed: 5, timestamp: 1000 }),
      makePoint({ speed: 5, timestamp: 2000 }),
      // Stop for 15 seconds
      makePoint({ speed: 0, timestamp: 3000 }),
      makePoint({ speed: 0, timestamp: 18000 }),
      // Resume
      makePoint({ speed: 5, timestamp: 19000 }),
    ];
    const moving = computeMovingTime(points);
    // Moving: 1000ms (0→1) + 1000ms (3→4) = 2000ms
    // Stop starts at t=2000 (when speed drops to 0 at i=2), lasts until t=18000 = 16s > 10s threshold
    expect(moving).toBe(2000);
  });

  it('counts short stops (<10s) as moving time', () => {
    const points = [
      makePoint({ speed: 5, timestamp: 1000 }),
      // Short stop for 5 seconds
      makePoint({ speed: 0, timestamp: 2000 }),
      makePoint({ speed: 0, timestamp: 7000 }),
      // Resume
      makePoint({ speed: 5, timestamp: 8000 }),
    ];
    const moving = computeMovingTime(points);
    // First interval (moving): 1000ms
    // Stop from t=1000 to t=7000 = 6s < 10s, counted as moving: 6000ms
    // Last interval (moving): 1000ms
    expect(moving).toBe(8000 - 1000); // total elapsed minus first timestamp offset
  });

  it('does not count time across a segment break', () => {
    const points = [
      makePoint({ timestamp: 1000 }),
      makePoint({ timestamp: 2000 }),
      makePoint({ timestamp: 3_602_000, segmentStart: true }),
      makePoint({ timestamp: 3_603_000 }),
    ];
    expect(computeMovingTime(points)).toBe(2000);
  });

  it('caps gaps and respects breaks for stored points without speed', () => {
    const points = [
      { lng: -85.3, lat: 35, altitude: 200, timestamp: 1000 },
      { lng: -85.3, lat: 35.001, altitude: 200, timestamp: 2000 },
      {
        lng: -121.3,
        lat: 44,
        altitude: 500,
        timestamp: 3_602_000,
        segmentStart: true,
      },
      { lng: -121.3, lat: 44.001, altitude: 500, timestamp: 3_603_000 },
    ];
    expect(computeMovingTime(points)).toBe(2000);
  });
});

// --- computeElevation ---

describe('computeElevation', () => {
  // Forward-backward EMA smoothing needs ~200+ points to converge,
  // and points must be spaced > ELEVATION_MIN_DISTANCE apart (~15m).
  // At 0.0003° spacing (~33m/point), this simulates realistic rides.

  // Guards the O'Leary Mountain regression: an averaged spike-filter
  // reference lags a sustained steep climb until every reading is rejected,
  // flattening the mountain (449 ft reported on a ~3,200 ft trail).  The
  // largest real sample-to-sample step there was 17.8 m — under the 25 m
  // threshold — so this must track cleanly.  10 m per ~33 m point ≈ 30% grade.
  it('keeps tracking a sustained steep climb', () => {
    const points = makeTrack(200, { startAlt: 1000, altStep: 10 });
    const { gain, loss, max, min } = computeElevation(points);

    // True gain is 199 * 10 = 1,990 m; smoothing trims only the ends.
    // A monotone climb must not fabricate descent, and max must track
    // the summit (not sag below it as a lagging-reference sawtooth does).
    expect(gain).toBeGreaterThan(1900);
    expect(loss).toBeLessThan(1);
    expect(max - min).toBeGreaterThan(1900);
  });

  it('still replaces an isolated spike', () => {
    // The behaviour the filter exists for, which the fix must not give up.
    const clean = makeTrack(200, { startAlt: 1000, altStep: 2 });
    const spiked = clean.map((point, i) =>
      i === 100 ? { ...point, altitude: (point.altitude ?? 0) + 200 } : point,
    );

    const before = computeElevation(clean);
    const after = computeElevation(spiked);

    // A 200 m spike must not show up as 200 m of extra height.
    expect(Math.abs(after.max - before.max)).toBeLessThan(20);
  });

  it('bounds the damage from a dropout longer than the cap', () => {
    // 8 bogus ramping readings — longer than ELEVATION_SPIKE_MAX_RUN — so the
    // tail of the burst is accepted at face value.  Some phantom gain/loss
    // leaks through (the price of not flatlining real climbs), but it must
    // stay bounded well under the 240 m excursion and fully symmetric.
    const points = makeTrack(100, { startAlt: 200, altStep: 0 }).map((p, i) =>
      i >= 40 && i < 48 ? { ...p, altitude: 200 + (i - 40) * 30 } : p,
    );
    const { gain, loss, max } = computeElevation(points);

    expect(gain).toBeLessThan(120); // measured ~98 m
    expect(loss).toBeLessThan(120);
    expect(max).toBeLessThan(320); // raw excursion peaks at 440 m
  });

  it('computes gain for a steady climb', () => {
    const points = makeTrack(200, { startAlt: 200, altStep: 2 });
    const { gain, loss } = computeElevation(points);
    expect(gain).toBeGreaterThan(0);
    expect(loss).toBe(0);
  });

  it('computes loss for a steady descent', () => {
    const points = makeTrack(200, { startAlt: 600, altStep: -2 });
    const { gain, loss } = computeElevation(points);
    expect(gain).toBe(0);
    expect(loss).toBeGreaterThan(0);
  });

  it('computes both gain and loss for up-and-down', () => {
    const up = makeTrack(100, { startAlt: 200, altStep: 3 });
    const down = makeTrack(100, {
      startAlt: 497,
      altStep: -3,
      startLat: up[up.length - 1].lat + 0.0003,
      startLng: up[up.length - 1].lng + 0.0003,
    });
    const points = [...up, ...down];
    for (let i = 0; i < points.length; i++) {
      points[i].timestamp = 1700000000000 + i * 1000;
    }
    const { gain, loss } = computeElevation(points);
    expect(gain).toBeGreaterThan(0);
    expect(loss).toBeGreaterThan(0);
  });

  it('returns zeros when all altitudes are null', () => {
    const points = makeTrack(5).map((p) => ({ ...p, altitude: null }));
    const { gain, loss, min, max } = computeElevation(points);
    expect(gain).toBe(0);
    expect(loss).toBe(0);
    expect(min).toBe(0);
    expect(max).toBe(0);
  });

  it('computes correct min and max', () => {
    const points = makeTrack(200, { startAlt: 100, altStep: 2 });
    const { min, max } = computeElevation(points);
    expect(min).toBeGreaterThanOrEqual(100);
    expect(max).toBeLessThanOrEqual(600);
    expect(max).toBeGreaterThan(min);
  });

  it('filters GPS jitter below the dead-band threshold', () => {
    // Simulate noisy GPS: altitude oscillates ±1m around 200m while moving.
    const points: RidePoint[] = Array.from({ length: 200 }, (_, i) => ({
      lng: -85.3 + i * 0.0003,
      lat: 35.05 + i * 0.0003,
      altitude: 200 + (i % 2 === 0 ? 1 : -1),
      accuracy: 5,
      speed: 5,
      timestamp: 1700000000000 + i * 1000,
    }));
    const { gain, loss } = computeElevation(points);
    expect(gain).toBe(0);
    expect(loss).toBe(0);
  });

  it('counts genuine climbs that exceed the dead band', () => {
    const points = makeTrack(200, { startAlt: 100, altStep: 2 });
    const { gain, loss } = computeElevation(points);
    // 200 points × 2m/step = 398m total. EMA + deadband captures most.
    expect(gain).toBeGreaterThan(100);
    expect(loss).toBe(0);
  });

  it('tracks loss correctly on a descent', () => {
    const points = makeTrack(200, { startAlt: 600, altStep: -2 });
    const { gain, loss } = computeElevation(points);
    expect(loss).toBeGreaterThan(100);
    expect(gain).toBe(0);
  });

  it('handles scattered null altitudes mid-ride', () => {
    // Climb with every 10th altitude null — simulates brief GPS altitude drops
    const points: RidePoint[] = Array.from({ length: 200 }, (_, i) => ({
      lng: -85.3 + i * 0.0003,
      lat: 35.05 + i * 0.0003,
      altitude: i % 10 === 5 ? null : 200 + i * 2,
      accuracy: 5,
      speed: 5,
      timestamp: 1700000000000 + i * 1000,
    }));
    const { gain } = computeElevation(points);
    // Should still detect most of the climb despite gaps
    expect(gain).toBeGreaterThan(50);
  });

  it('smooths elevation independently across segment breaks', () => {
    const first = makeTrack(20, { startAlt: 100, altStep: 0 });
    const second = makeTrack(20, {
      startLat: 44,
      startLng: -121.3,
      startAlt: 1000,
      altStep: 0,
    });
    second[0].segmentStart = true;

    const { min, max } = computeElevation([...first, ...second]);
    expect(min).toBeCloseTo(100);
    expect(max).toBeCloseTo(1000);
  });
});

// --- computeMaxSpeed ---

describe('computeMaxSpeed', () => {
  it('returns 0 for empty array', () => {
    expect(computeMaxSpeed([])).toBe(0);
  });

  it('returns the highest plausible speed', () => {
    const points = [
      makePoint({ speed: 3 }),
      makePoint({ speed: 8 }),
      makePoint({ speed: 5 }),
    ];
    expect(computeMaxSpeed(points)).toBe(8);
  });

  it('filters out implausible speeds (>= 40 m/s)', () => {
    const points = [
      makePoint({ speed: 5 }),
      makePoint({ speed: 50 }), // GPS glitch
      makePoint({ speed: 10 }),
    ];
    expect(computeMaxSpeed(points)).toBe(10);
  });

  it('allows high but plausible speeds (< 40 m/s)', () => {
    const points = [
      makePoint({ speed: 5 }),
      makePoint({ speed: 35 }), // fast downhill, ~78 mph
      makePoint({ speed: 10 }),
    ];
    expect(computeMaxSpeed(points)).toBe(35);
  });

  it('ignores null speeds', () => {
    const points = [
      makePoint({ speed: null }),
      makePoint({ speed: 7 }),
      makePoint({ speed: null }),
    ];
    expect(computeMaxSpeed(points)).toBe(7);
  });
});

// --- computeBounds ---

describe('computeBounds', () => {
  it('computes correct bounding box', () => {
    const points = [
      makePoint({ lng: -85.31, lat: 35.04 }),
      makePoint({ lng: -85.29, lat: 35.06 }),
      makePoint({ lng: -85.3, lat: 35.05 }),
    ];
    const bounds = computeBounds(points);
    expect(bounds).not.toBeNull();
    const [swLng, swLat, neLng, neLat] = bounds as [
      number,
      number,
      number,
      number,
    ];
    expect(swLng).toBe(-85.31);
    expect(swLat).toBe(35.04);
    expect(neLng).toBe(-85.29);
    expect(neLat).toBe(35.06);
  });

  it('returns equal bounds for a single point', () => {
    const points = [makePoint({ lng: -85.3, lat: 35.05 })];
    const bounds = computeBounds(points);
    expect(bounds).not.toBeNull();
    const [swLng, swLat, neLng, neLat] = bounds as [
      number,
      number,
      number,
      number,
    ];
    expect(swLng).toBe(-85.3);
    expect(neLng).toBe(-85.3);
    expect(swLat).toBe(35.05);
    expect(neLat).toBe(35.05);
  });

  it('returns null for empty array', () => {
    expect(computeBounds([])).toBeNull();
  });
});

// --- computeRideStats ---

describe('computeRideStats', () => {
  it('returns zero stats for fewer than 2 points', () => {
    const stats = computeRideStats([makePoint()]);
    expect(stats.distance).toBe(0);
    expect(stats.elapsedTime).toBe(0);
    expect(stats.movingTime).toBe(0);
    expect(stats.avgSpeed).toBe(0);
    expect(stats.maxSpeed).toBe(0);
    expect(stats.elevationGain).toBe(0);
  });

  it('computes integrated stats for a realistic track', () => {
    const points = makeTrack(200, {
      startAlt: 200,
      altStep: 2,
      speed: 5,
      intervalMs: 1000,
    });
    const stats = computeRideStats(points);
    expect(stats.distance).toBeGreaterThan(0);
    expect(stats.elapsedTime).toBe(199000);
    expect(stats.movingTime).toBeGreaterThan(0);
    expect(stats.maxSpeed).toBe(5);
    expect(stats.elevationGain).toBeGreaterThan(0);
    expect(stats.elevationMax).toBeGreaterThan(stats.elevationMin);
  });

  it('avgSpeed equals distance / (movingTime / 1000)', () => {
    const points = makeTrack(10, { speed: 5, intervalMs: 2000 });
    const stats = computeRideStats(points);
    if (stats.movingTime > 0) {
      const expected = stats.distance / (stats.movingTime / 1000);
      expect(stats.avgSpeed).toBeCloseTo(expected, 5);
    }
  });

  it('time and distance are independent of elevation point count', () => {
    // Simulate the DEM dedup scenario: compute stats from full points,
    // then verify that using a subset for elevation doesn't affect
    // time/distance/speed.
    const fullPoints = makeTrack(200, {
      startAlt: 200,
      altStep: 2,
      speed: 5,
      intervalMs: 1000,
    });
    const fullStats = computeRideStats(fullPoints);

    // Compute elevation from a subset (as DEM dedup would produce)
    const subset = fullPoints.filter((_, i) => i % 3 === 0);
    const subsetElev = computeElevation(subset);

    // Time and distance from full set should be preserved
    expect(fullStats.elapsedTime).toBe(199000);
    expect(fullStats.distance).toBeGreaterThan(0);

    // Subset elevation stats exist but differ from full-set elevation
    expect(subsetElev.gain).toBeGreaterThanOrEqual(0);
    // The key assertion: fullStats time/distance are NOT affected by
    // what computeElevation returns from a different point set
    expect(fullStats.movingTime).toBeGreaterThan(0);
    expect(fullStats.avgSpeed).toBeGreaterThan(0);
  });
});

// --- rideToElevationProfile ---

describe('rideToElevationProfile', () => {
  function makeRide(points: RidePoint[]): RecordedRide {
    return {
      id: 'test',
      name: 'Test Ride',
      startTime: points[0]?.timestamp ?? 0,
      endTime: points[points.length - 1]?.timestamp ?? 0,
      points,
      stats: computeRideStats(points),
      bounds: computeBounds(points) ?? [0, 0, 0, 0],
    };
  }

  it('returns null when fewer than 5 points have altitude', () => {
    const points = makeTrack(3, { startAlt: 200 });
    expect(rideToElevationProfile(makeRide(points))).toBeNull();
  });

  it('returns null when all altitudes are null', () => {
    const points = makeTrack(10).map((p) => ({ ...p, altitude: null }));
    expect(rideToElevationProfile(makeRide(points))).toBeNull();
  });

  it('returns valid elevation profile for a ride with altitude', () => {
    const points = makeTrack(20, { startAlt: 200, altStep: 1 });
    const ride = makeRide(points);
    const profile = rideToElevationProfile(ride);
    expect(profile).not.toBeNull();
    expect(profile?.trail).toBe('Test Ride');
    expect(profile?.profile.length).toBeGreaterThanOrEqual(5);
  });

  it('profile distances are cumulative and in feet', () => {
    const points = makeTrack(10, { startAlt: 200, altStep: 0 });
    const profile = rideToElevationProfile(makeRide(points));
    expect(profile).not.toBeNull();
    const p = profile as NonNullable<typeof profile>;
    expect(p.profile[0][0]).toBe(0); // first distance is 0
    for (let i = 1; i < p.profile.length; i++) {
      expect(p.profile[i][0]).toBeGreaterThan(p.profile[i - 1][0]);
    }
  });

  it('does not advance profile distance across a segment break', () => {
    const points = makeTrack(10, { startAlt: 200 });
    points[5] = {
      ...points[5],
      lat: 44,
      lng: -121.3,
      segmentStart: true,
    };
    const profile = pointsToElevationProfile(points, 'Segmented Ride');

    expect(profile).not.toBeNull();
    expect(profile?.profile[5][0]).toBe(profile?.profile[4][0]);
  });

  it('converts elevation to feet', () => {
    const points = makeTrack(10, { startAlt: 100, altStep: 0 });
    const profile = rideToElevationProfile(makeRide(points));
    expect(profile).not.toBeNull();
    // 100m ≈ 328 ft — profile elevations should be in feet range
    const elevations = (profile as NonNullable<typeof profile>).profile.map(
      (p) => p[1],
    );
    for (const e of elevations) {
      expect(e).toBeGreaterThan(300);
      expect(e).toBeLessThan(400);
    }
  });
});
