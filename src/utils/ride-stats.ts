// Pure functions for computing ride statistics from GPS points

import type { ElevationProfile } from '../data/mountain-bike-trails';
import type {
  RecordedRide,
  RidePoint,
  RideStats,
  StoredRidePoint,
} from '../data/ride';
import { FEET_PER_METER } from '../utils/format';

import {
  createAltitudeSpikeFilter,
  createElevationAccumulator,
  type ElevationTotals,
} from './elevation';

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
// Cap on a single point-to-point time delta counted as moving (ms). GPS points
// arrive ~1/s; a larger gap means signal loss or a pause — counting the whole
// gap would inflate moving time (and deflate average speed).
const MAX_SEGMENT_MS = 30_000;
// Max plausible cycling speed (m/s, ~89 mph)
const MAX_PLAUSIBLE_SPEED = 40;
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
    if (points[i].segmentStart) continue;
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

  // Stored points lack speed data, so count every recorded interval as moving,
  // while still excluding explicit breaks and capping GPS/background gaps.
  const hasSpeed = 'speed' in points[0];
  if (!hasSpeed) {
    let movingMs = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].segmentStart) continue;
      const dt = points[i].timestamp - points[i - 1].timestamp;
      movingMs += Math.min(Math.max(dt, 0), MAX_SEGMENT_MS);
    }
    return movingMs;
  }

  let movingMs = 0;
  let stopStart: number | null = null;

  for (let i = 1; i < points.length; i++) {
    if (points[i].segmentStart) {
      stopStart = null;
      continue;
    }
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
      movingMs += Math.min(dt, MAX_SEGMENT_MS);
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
 * Smooth altitudes with spike rejection + centered moving average.
 * 1. Reject altitude spikes (>ELEVATION_SPIKE_THRESHOLD from the last
 *    accepted reading, at most ELEVATION_SPIKE_MAX_RUN in a row)
 * 2. Apply centered moving average (window = 2 * SMOOTH_HALF + 1 points)
 */
export const ELEVATION_SMOOTH_HALF = 5; // 11-point centered window

function smoothAltitudes(
  points: { altitude: number | null; segmentStart?: boolean }[],
): number[] {
  const result: number[] = new Array(points.length).fill(Number.NaN);
  let start = 0;

  for (let end = 1; end <= points.length; end++) {
    if (end < points.length && !points[end].segmentStart) continue;
    smoothAltitudeSegment(points, start, end, result);
    start = end;
  }

  return result;
}

function smoothAltitudeSegment(
  points: { altitude: number | null }[],
  start: number,
  end: number,
  result: number[],
): void {
  // Collect non-null indices and values
  const rawVals: number[] = [];
  const idxs: number[] = [];
  for (let i = start; i < end; i++) {
    if (points[i].altitude !== null) {
      rawVals.push(points[i].altitude as number);
      idxs.push(i);
    }
  }
  if (rawVals.length === 0) return;

  // Spike rejection: replace readings that jump >threshold from the last
  // accepted reading.  The reference must be a raw reading, not an average:
  // any averaged reference lags a sustained climb, and once that lag exceeds
  // the threshold every subsequent reading is rejected and the profile
  // flatlines (an EMA reference erased most of O'Leary Mountain this way).
  // A raw reference advances step-by-step with the ground, so no real slope
  // can out-run it.  Seed from the median of the first few readings so a
  // bad startup value doesn't poison the series.
  const SEED_COUNT = Math.min(5, rawVals.length);
  const seedSlice = rawVals.slice(0, SEED_COUNT).sort((a, b) => a - b);
  const spikes = createAltitudeSpikeFilter(
    seedSlice[Math.floor(seedSlice.length / 2)],
  );
  const vals = rawVals.map((altitude) => spikes.add(altitude));

  // Centered moving average
  for (let i = 0; i < vals.length; i++) {
    const lo = Math.max(0, i - ELEVATION_SMOOTH_HALF);
    const hi = Math.min(vals.length - 1, i + ELEVATION_SMOOTH_HALF);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += vals[j];
    result[idxs[i]] = sum / (hi - lo + 1);
  }
}

export function computeElevation(points: AnyRidePoint[]): ElevationTotals {
  const smoothed = smoothAltitudes(points);
  const elevation = createElevationAccumulator();
  for (let i = 0; i < smoothed.length; i++) {
    if (points[i].segmentStart) elevation.resetSegment();
    const altitude = smoothed[i];
    if (Number.isNaN(altitude)) continue;
    const distanceMeters =
      elevation.isSeeded && i > 0
        ? haversineDistance(
            points[i - 1].lat,
            points[i - 1].lng,
            points[i].lat,
            points[i].lng,
          )
        : 0;
    elevation.add(altitude, distanceMeters);
  }
  return elevation.totals();
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
  points: {
    lat: number;
    lng: number;
    altitude: number | null;
    segmentStart?: boolean;
  }[],
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
  const geometryGapDetails: NonNullable<
    ElevationProfile['geometryGapDetails']
  > = [];
  let cumDistFt = 0;
  let pendingSegmentBreak = false;

  for (let i = 0; i < points.length; i++) {
    if (points[i].segmentStart && profile.length > 0) {
      pendingSegmentBreak = true;
    }
    if (Number.isNaN(smoothed[i])) continue;

    if (i > 0 && !points[i].segmentStart) {
      const seg = haversineDistance(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
      cumDistFt += seg * FEET_PER_METER;
    }

    const profilePoint: [number, number, number, number] = [
      cumDistFt,
      smoothed[i] * FEET_PER_METER,
      points[i].lng,
      points[i].lat,
    ];
    const previousProfilePoint = profile[profile.length - 1];
    if (pendingSegmentBreak && previousProfilePoint) {
      geometryGapDetails.push({
        feet: Math.round(
          haversineDistance(
            previousProfilePoint[3],
            previousProfilePoint[2],
            profilePoint[3],
            profilePoint[2],
          ) * FEET_PER_METER,
        ),
        from: [previousProfilePoint[2], previousProfilePoint[3]],
        to: [profilePoint[2], profilePoint[3]],
      });
      pendingSegmentBreak = false;
    }
    profile.push(profilePoint);
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
    ...(geometryGapDetails.length > 0 && { geometryGapDetails }),
  };
}
