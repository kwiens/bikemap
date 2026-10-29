/** Shared elevation filtering and accumulation, in meters. */
const ELEVATION_EMA_ALPHA = 0.1;
const ELEVATION_DEAD_BAND = 3;
const ELEVATION_SPIKE_THRESHOLD = 25;
// A sustained climb must eventually advance the raw reference. An averaged
// reference can lag steep ground far enough to reject every remaining reading.
export const ELEVATION_SPIKE_MAX_RUN = 5;
const ELEVATION_MIN_DISTANCE = 15;
export const ELEVATION_MAX_ALT_ACCURACY = 15;

export interface ElevationTotals {
  gain: number;
  loss: number;
  min: number;
  max: number;
}

/** Replace short outlier bursts; accept a sustained deviation as real ground. */
export function createAltitudeSpikeFilter(seed: number | null = null): {
  add(altitude: number): number;
} {
  let reference = seed;
  let rejectRun = 0;
  return {
    add(altitude) {
      if (
        reference !== null &&
        Math.abs(altitude - reference) > ELEVATION_SPIKE_THRESHOLD &&
        rejectRun < ELEVATION_SPIKE_MAX_RUN
      ) {
        rejectRun += 1;
        return reference;
      }
      reference = altitude;
      rejectRun = 0;
      return altitude;
    },
  };
}

/**
 * Accumulate already-smoothed altitudes. Callers choose their smoother and
 * supply horizontal distance, so live GPS and centered DEM profiles share the
 * same deadband without changing either smoothing policy.
 */
export function createElevationAccumulator(initial?: ElevationTotals): {
  add(altitude: number | null, distanceMeters: number): void;
  readonly isSeeded: boolean;
  resetSegment(): void;
  totals(): ElevationTotals;
} {
  let gain = initial?.gain ?? 0;
  let loss = initial?.loss ?? 0;
  let min = initial?.min ?? Number.POSITIVE_INFINITY;
  let max = initial?.max ?? Number.NEGATIVE_INFINITY;
  let anchor: number | null = null;
  let distanceSinceAnchorMeters = 0;

  return {
    get isSeeded() {
      return anchor !== null;
    },
    add(altitude, distanceMeters) {
      distanceSinceAnchorMeters += distanceMeters;
      if (altitude === null) return;
      min = Math.min(min, altitude);
      max = Math.max(max, altitude);
      if (anchor === null) {
        anchor = altitude;
        return;
      }
      if (distanceSinceAnchorMeters < ELEVATION_MIN_DISTANCE) return;
      const delta = altitude - anchor;
      if (Math.abs(delta) <= ELEVATION_DEAD_BAND) return;
      if (delta > 0) gain += delta;
      else loss -= delta;
      anchor = altitude;
      distanceSinceAnchorMeters = 0;
    },
    resetSegment() {
      anchor = null;
      distanceSinceAnchorMeters = 0;
    },
    totals() {
      return {
        gain,
        loss,
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 0,
      };
    },
  };
}

/** The causal smoother used while recording: no future samples are available. */
export function createLiveElevationAccumulator(initial?: ElevationTotals): {
  add(
    altitude: number | null,
    distanceMeters: number,
    isSegmentStart?: boolean,
  ): number;
} {
  const elevation = createElevationAccumulator(initial);
  let spikes = createAltitudeSpikeFilter();
  let smoothed: number | null = null;
  return {
    add(altitude, distanceMeters, isSegmentStart = false) {
      if (isSegmentStart) {
        spikes = createAltitudeSpikeFilter();
        smoothed = null;
        elevation.resetSegment();
      }
      let current: number | null = null;
      if (altitude !== null) {
        const filtered = spikes.add(altitude);
        smoothed =
          smoothed === null
            ? filtered
            : ELEVATION_EMA_ALPHA * filtered +
              (1 - ELEVATION_EMA_ALPHA) * smoothed;
        current = smoothed;
      }
      elevation.add(current, distanceMeters);
      return elevation.totals().gain;
    },
  };
}
