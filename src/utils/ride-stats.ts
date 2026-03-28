// Pure functions for computing ride statistics from GPS points

import type { ElevationProfile } from '../data/mountain-bike-trails';
import type { RecordedRide, RidePoint, RideStats } from '../data/ride';
import { FEET_PER_METER } from '../utils/format';
const EARTH_RADIUS_M = 6371000;

// Accuracy threshold: ignore points with GPS accuracy worse than this
const MAX_ACCURACY_M = 30;
// Speed threshold: below this is considered "stopped" (m/s, ~1.1 mph)
const STOP_SPEED = 0.5;
// Duration threshold: must be stopped for this long to count (ms)
const STOP_DURATION_MS = 10_000;
// Max plausible cycling speed (m/s, ~67 mph)
const MAX_PLAUSIBLE_SPEED = 30;
// Smoothing window for elevation (points on each side)
const ELEVATION_SMOOTH_WINDOW = 2;

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

export function computeDistance(points: RidePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i].accuracy > MAX_ACCURACY_M ||
      points[i - 1].accuracy > MAX_ACCURACY_M
    ) {
      continue;
    }
    total += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return total;
}

export function computeMovingTime(points: RidePoint[]): number {
  if (points.length < 2) return 0;

  let movingMs = 0;
  let stopStart: number | null = null;

  for (let i = 1; i < points.length; i++) {
    const prevSpeed = points[i - 1].speed ?? 0;
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

function smoothAltitudes(points: RidePoint[]): number[] {
  const altitudes = points.map((p) => p.altitude);
  const smoothed: number[] = [];

  for (let i = 0; i < altitudes.length; i++) {
    if (altitudes[i] === null) {
      smoothed.push(Number.NaN);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - ELEVATION_SMOOTH_WINDOW);
      j <= Math.min(altitudes.length - 1, i + ELEVATION_SMOOTH_WINDOW);
      j++
    ) {
      if (altitudes[j] !== null) {
        sum += altitudes[j] as number;
        count++;
      }
    }
    smoothed.push(count > 0 ? sum / count : Number.NaN);
  }

  return smoothed;
}

export function computeElevation(points: RidePoint[]): {
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
  let prevValid: number | null = null;

  for (const alt of smoothed) {
    if (Number.isNaN(alt)) continue;
    if (alt < min) min = alt;
    if (alt > max) max = alt;
    if (prevValid !== null) {
      const delta = alt - prevValid;
      if (delta > 0) gain += delta;
      else loss += Math.abs(delta);
    }
    prevValid = alt;
  }

  if (min === Infinity) min = 0;
  if (max === -Infinity) max = 0;

  return { gain, loss, min, max };
}

export function computeMaxSpeed(points: RidePoint[]): number {
  let maxSpeed = 0;
  for (const p of points) {
    if (
      p.speed !== null &&
      p.speed > maxSpeed &&
      p.speed < MAX_PLAUSIBLE_SPEED
    ) {
      maxSpeed = p.speed;
    }
  }
  return maxSpeed;
}

export function computeBounds(
  points: RidePoint[],
): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];

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

export function computeRideStats(points: RidePoint[]): RideStats {
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
  const pointsWithAlt = ride.points.filter((p) => p.altitude !== null);
  if (pointsWithAlt.length < 5) return null;

  const smoothed = smoothAltitudes(ride.points);
  const profile: [number, number, number, number][] = [];
  let cumDistFt = 0;

  for (let i = 0; i < ride.points.length; i++) {
    if (Number.isNaN(smoothed[i])) continue;

    if (i > 0) {
      const seg = haversineDistance(
        ride.points[i - 1].lat,
        ride.points[i - 1].lng,
        ride.points[i].lat,
        ride.points[i].lng,
      );
      cumDistFt += seg * FEET_PER_METER;
    }

    profile.push([
      cumDistFt,
      smoothed[i] * FEET_PER_METER,
      ride.points[i].lng,
      ride.points[i].lat,
    ]);
  }

  if (profile.length < 5) return null;

  return {
    trail: ride.name,
    distance: profile[profile.length - 1][0],
    gain: ride.stats.elevationGain * FEET_PER_METER,
    loss: ride.stats.elevationLoss * FEET_PER_METER,
    min: ride.stats.elevationMin * FEET_PER_METER,
    max: ride.stats.elevationMax * FEET_PER_METER,
    profile,
  };
}
