// Pure functions for computing ride statistics from GPS points

import type { ElevationProfile } from '../data/mountain-bike-trails';
import type {
  RecordedRide,
  RidePoint,
  RideStats,
  StoredRidePoint,
} from '../data/ride';
import { FEET_PER_METER } from '../utils/format';

// Functions accept both full RidePoint (during recording) and StoredRidePoint (from storage).
// Missing speed/accuracy fields are handled gracefully.
type AnyRidePoint = RidePoint | StoredRidePoint;

const EARTH_RADIUS_M = 6371000;

// Accuracy threshold: ignore points with GPS accuracy worse than this
export const MAX_ACCURACY_M = 30;
// Speed threshold: below this is considered "stopped" (m/s, ~1.1 mph)
const STOP_SPEED = 0.5;
// Duration threshold: must be stopped for this long to count (ms)
const STOP_DURATION_MS = 10_000;
// Max plausible cycling speed (m/s, ~67 mph)
const MAX_PLAUSIBLE_SPEED = 30;
// EMA smoothing factor for elevation (0–1).  Lower = heavier smoothing.
// 0.1 filters GPS altitude noise well while preserving real climbs.
const ELEVATION_EMA_ALPHA = 0.1;
// Dead-band threshold for elevation gain/loss (meters).  Accumulated
// elevation change must exceed this before it counts as gain or loss.
// Filters GPS altitude jitter that otherwise inflates totals ~3-4×.
const ELEVATION_DEAD_BAND = 3;

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeDistance(points: AnyRidePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const acc = 'accuracy' in points[i] ? (points[i] as RidePoint).accuracy : 0;
    const prevAcc =
      'accuracy' in points[i - 1] ? (points[i - 1] as RidePoint).accuracy : 0;
    if (acc > MAX_ACCURACY_M || prevAcc > MAX_ACCURACY_M) continue;
    total += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return total;
}

export function computeMovingTime(points: AnyRidePoint[]): number {
  if (points.length < 2) return 0;

  // If points lack speed data (StoredRidePoint), return total elapsed time
  const hasSpeed = 'speed' in points[0];
  if (!hasSpeed) {
    return points[points.length - 1].timestamp - points[0].timestamp;
  }

  let movingMs = 0;
  let stopStart: number | null = null;

  for (let i = 1; i < points.length; i++) {
    const prevSpeed = (points[i - 1] as RidePoint).speed ?? 0;
    const dt = points[i].timestamp - points[i - 1].timestamp;

    if (prevSpeed < STOP_SPEED) {
      // Previous point was stopped — begin or extend a stop
      if (stopStart === null) stopStart = points[i - 1].timestamp;
    } else {
      // Previous point was moving — this segment counts as moving
      if (stopStart !== null) {
        // Transitioning from stop → moving: evaluate the stop
        const stopDuration = points[i - 1].timestamp - stopStart;
        if (stopDuration < STOP_DURATION_MS) {
          movingMs += stopDuration;
        }
        stopStart = null;
      }
      movingMs += dt;
    }
  }

  // Handle a trailing stop (ride ended while stopped)
  if (stopStart !== null) {
    const lastTimestamp = points[points.length - 1].timestamp;
    const stopDuration = lastTimestamp - stopStart;
    if (stopDuration < STOP_DURATION_MS) {
      movingMs += stopDuration;
    }
  }

  return movingMs;
}

/**
 * Smooth altitudes using a forward-backward EMA pass.
 * Running EMA forward then backward and averaging eliminates the phase lag
 * of a single-pass EMA, producing a centered smooth without look-ahead.
 */
function smoothAltitudes(points: { altitude: number | null }[]): number[] {
  const alts = points.map((p) => p.altitude);
  const result: number[] = new Array(alts.length).fill(Number.NaN);

  // Collect non-null indices and values
  const vals: number[] = [];
  const idxs: number[] = [];
  for (let i = 0; i < alts.length; i++) {
    if (alts[i] !== null) {
      vals.push(alts[i] as number);
      idxs.push(i);
    }
  }
  if (vals.length === 0) return result;

  // Forward EMA pass
  const fwd: number[] = [vals[0]];
  for (let i = 1; i < vals.length; i++) {
    fwd.push(
      ELEVATION_EMA_ALPHA * vals[i] + (1 - ELEVATION_EMA_ALPHA) * fwd[i - 1],
    );
  }

  // Backward EMA pass
  const bwd: number[] = new Array(vals.length);
  bwd[vals.length - 1] = vals[vals.length - 1];
  for (let i = vals.length - 2; i >= 0; i--) {
    bwd[i] =
      ELEVATION_EMA_ALPHA * vals[i] + (1 - ELEVATION_EMA_ALPHA) * bwd[i + 1];
  }

  // Average forward and backward passes
  for (let i = 0; i < vals.length; i++) {
    result[idxs[i]] = (fwd[i] + bwd[i]) / 2;
  }

  return result;
}

export function computeElevation(points: AnyRidePoint[]): {
  gain: number;
  loss: number;
  min: number;
  max: number;
} {
  const smoothed = smoothAltitudes(points);
  let gain = 0;
  let loss = 0;
  let min = Infinity;
  let max = -Infinity;

  // Dead-band accumulator: track the last "committed" altitude and
  // only count gain/loss once the change exceeds the threshold.
  let anchor: number | null = null;

  for (const alt of smoothed) {
    if (Number.isNaN(alt)) continue;
    if (alt < min) min = alt;
    if (alt > max) max = alt;
    if (anchor === null) {
      anchor = alt;
      continue;
    }
    const delta = alt - anchor;
    if (delta > ELEVATION_DEAD_BAND) {
      gain += delta;
      anchor = alt;
    } else if (delta < -ELEVATION_DEAD_BAND) {
      loss += Math.abs(delta);
      anchor = alt;
    }
  }

  if (min === Infinity) min = 0;
  if (max === -Infinity) max = 0;

  return { gain, loss, min, max };
}

export function computeMaxSpeed(points: AnyRidePoint[]): number {
  let maxSpeed = 0;
  for (const p of points) {
    const speed = 'speed' in p ? (p as RidePoint).speed : null;
    if (speed !== null && speed > maxSpeed && speed < MAX_PLAUSIBLE_SPEED) {
      maxSpeed = speed;
    }
  }
  return maxSpeed;
}

export function computeBounds(
  points: AnyRidePoint[],
): [number, number, number, number] | null {
  if (points.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}

export function computeRideStats(points: AnyRidePoint[]): RideStats {
  if (points.length < 2) {
    return {
      distance: 0,
      elapsedTime: 0,
      movingTime: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      elevationGain: 0,
      elevationLoss: 0,
      elevationMin: 0,
      elevationMax: 0,
    };
  }

  const distance = computeDistance(points);
  const elapsedTime = points[points.length - 1].timestamp - points[0].timestamp;
  const movingTime = computeMovingTime(points);
  const maxSpeed = computeMaxSpeed(points);
  const avgSpeed = movingTime > 0 ? distance / (movingTime / 1000) : 0;
  const { gain, loss, min, max } = computeElevation(points);

  return {
    distance,
    elapsedTime,
    movingTime,
    avgSpeed,
    maxSpeed,
    elevationGain: gain,
    elevationLoss: loss,
    elevationMin: min,
    elevationMax: max,
  };
}

export function rideToElevationProfile(
  ride: RecordedRide,
): ElevationProfile | null {
  return pointsToElevationProfile(ride.points, ride.name, ride.stats);
}

/** Build an elevation profile from raw GPS points (works for both saved rides and live recording). */
export function pointsToElevationProfile(
  points: { lat: number; lng: number; altitude: number | null }[],
  name: string,
  stats?: {
    distance?: number; // meters — used for consistent total distance
    elevationGain: number;
    elevationLoss: number;
    elevationMin: number;
    elevationMax: number;
  },
): ElevationProfile | null {
  const pointsWithAlt = points.filter((p) => p.altitude !== null);
  if (pointsWithAlt.length < 5) return null;

  const smoothed = smoothAltitudes(points);
  const profile: [number, number, number, number][] = [];
  let cumDistFt = 0;

  for (let i = 0; i < points.length; i++) {
    if (Number.isNaN(smoothed[i])) continue;

    if (i > 0) {
      const seg = haversineDistance(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
      cumDistFt += seg * FEET_PER_METER;
    }

    profile.push([
      cumDistFt,
      smoothed[i] * FEET_PER_METER,
      points[i].lng,
      points[i].lat,
    ]);
  }

  if (profile.length < 5) return null;

  // Use provided stats or compute from the smoothed profile
  let gain: number;
  let loss: number;
  let min: number;
  let max: number;
  if (stats) {
    gain = stats.elevationGain * FEET_PER_METER;
    loss = stats.elevationLoss * FEET_PER_METER;
    min = stats.elevationMin * FEET_PER_METER;
    max = stats.elevationMax * FEET_PER_METER;
  } else {
    const computed = computeElevation(points as AnyRidePoint[]);
    gain = computed.gain * FEET_PER_METER;
    loss = computed.loss * FEET_PER_METER;
    min = computed.min * FEET_PER_METER;
    max = computed.max * FEET_PER_METER;
  }

  const totalDistFt =
    stats?.distance != null
      ? stats.distance * FEET_PER_METER
      : profile[profile.length - 1][0];

  return {
    trail: name,
    distance: totalDistFt,
    gain,
    loss,
    min,
    max,
    profile,
  };
}
