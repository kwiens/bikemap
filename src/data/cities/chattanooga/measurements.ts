import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import generatedMeasurements from './trail-measurements.json';

interface TrailMeasurement {
  defaultBounds: [number, number, number, number];
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  elevationMax: number;
  elevationMin: number;
}

const measurements = generatedMeasurements as unknown as Record<
  string,
  TrailMeasurement | undefined
>;

/** Applies measurements derived from the same GIS line the map renders. */
export function applyChattanoogaMeasurements(
  trails: MountainBikeTrail[],
): MountainBikeTrail[] {
  return trails.map((trail) => {
    const measurement = measurements[trail.trailName];
    return measurement ? { ...trail, ...measurement } : trail;
  });
}

export function getChattanoogaMeasurement(
  trailName: string,
): TrailMeasurement | undefined {
  return measurements[trailName];
}
