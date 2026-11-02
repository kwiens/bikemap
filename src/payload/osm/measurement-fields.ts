import type { Measurements } from './measure';

/** Keep the measured line's summaries and per-point chart together on save. */
export function trailFieldsFromMeasurements(measured: Measurements) {
  return {
    bounds: measured.bounds,
    distance: measured.distance,
    elevationGain: measured.elevationGain,
    elevationLoss: measured.elevationLoss,
    elevationMax: measured.elevationMax,
    elevationMin: measured.elevationMin,
    elevationProfile: measured.profile,
  };
}
