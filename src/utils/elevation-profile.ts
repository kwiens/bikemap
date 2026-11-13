import type {
  ElevationProfile,
  ElevationProfileGapDetail,
} from '@/data/mountain-bike-trails';

export interface ElevationProfileMeasurements {
  bounds: [number, number, number, number];
  /** Miles, matching the Payload trail field. */
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  elevationMax: number;
  elevationMin: number;
}

/**
 * Narrows untyped JSON into the profile shape used by both charts.
 *
 * Payload stores this as JSON and static files cross the same boundary, so a
 * single bad tuple must reject the value before either chart starts indexing
 * into it. Optional OSM metadata is intentionally left opaque: neither chart
 * needs it to draw or summarize the elevation series.
 */
export function parseElevationProfile(value: unknown): ElevationProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const profile = value as Partial<ElevationProfile>;
  if (
    typeof profile.trail !== 'string' ||
    !isNonnegative(profile.distance) ||
    !isNonnegative(profile.gain) ||
    !isNonnegative(profile.loss) ||
    !isFiniteNumber(profile.min) ||
    !isFiniteNumber(profile.max) ||
    profile.min > profile.max ||
    !Array.isArray(profile.profile) ||
    profile.profile.length === 0 ||
    !profile.profile.every(isProfilePoint) ||
    (profile.geometryGapDetails !== undefined &&
      (!Array.isArray(profile.geometryGapDetails) ||
        !profile.geometryGapDetails.every(isGapDetail)))
  ) {
    return null;
  }

  return profile as ElevationProfile;
}

/** Converts a validated profile's feet-based totals into Payload fields. */
export function measurementsFromElevationProfile(
  profile: ElevationProfile,
): ElevationProfileMeasurements {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [, , longitude, latitude] of profile.profile) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  return {
    bounds: [west, south, east, north],
    distance: Number((profile.distance / FEET_PER_MILE).toFixed(2)),
    elevationGain: Math.round(profile.gain),
    elevationLoss: Math.round(profile.loss),
    elevationMax: Math.round(profile.max),
    elevationMin: Math.round(profile.min),
  };
}

/** Finds section boundaries in both stored profiles and legacy ride charts. */
export function elevationProfileBreaks(
  points: ElevationProfile['profile'],
  gaps: ElevationProfile['geometryGapDetails'] = [],
): Map<number, ElevationProfileGapDetail | undefined> {
  const byEdge = new Map(
    gaps.map((gap) => [
      `${gap.from[0]},${gap.from[1]}:${gap.to[0]},${gap.to[1]}`,
      gap,
    ]),
  );
  const breaks = new Map<number, ElevationProfileGapDetail | undefined>();
  for (let index = 1; index < points.length; index++) {
    const [distance, , lng, lat] = points[index];
    const [previousDistance, , previousLng, previousLat] = points[index - 1];
    const gap = byEdge.get(`${previousLng},${previousLat}:${lng},${lat}`);
    const hasJumpAtSameDistance =
      distance === previousDistance &&
      (lng !== previousLng || lat !== previousLat);
    if (gap || distance < previousDistance || hasJumpAtSameDistance) {
      breaks.set(index, gap);
    }
  }
  return breaks;
}

export interface ElevationChartLayout {
  pointX: number[];
  ranges: [number, number][];
  breaks: { left: number; right: number; label: string }[];
}

/** Gives breaks display space without adding distance to the profile. */
export function layoutElevationChart(
  points: ElevationProfile['profile'],
  width: number,
  gapDetails: ElevationProfile['geometryGapDetails'],
): ElevationChartLayout {
  const boundaries = elevationProfileBreaks(points, gapDetails);
  // Keep at least 80% of a narrow chart for the measured terrain.
  const gapWidth = Math.min(14, (width * 0.2) / Math.max(boundaries.size, 1));
  const plotWidth = width - gapWidth * boundaries.size;
  let distance = 0;
  const distances = points.map(([position], index) => {
    if (index > 0 && !boundaries.has(index)) {
      distance += position - points[index - 1][0];
    }
    return distance;
  });
  const breaks: ElevationChartLayout['breaks'] = [];
  const starts = points.length ? [0] : [];
  const pointX = distances.map((position, index) => {
    const left =
      (position / (distance || 1)) * plotWidth + breaks.length * gapWidth;
    if (!boundaries.has(index)) return left;

    const feet = boundaries.get(index)?.feet ?? 0;
    const right = left + gapWidth;
    starts.push(index);
    breaks.push({
      left,
      right,
      label:
        feet > 0
          ? `${feet.toLocaleString()} ft between sections`
          : 'Section break',
    });
    return right;
  });
  return {
    breaks,
    pointX,
    ranges: starts.map((start, index) => [
      start,
      starts[index + 1] ?? points.length,
    ]),
  };
}

function isProfilePoint(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    isNonnegative(value[0]) &&
    isFiniteNumber(value[1]) &&
    isLongitude(value[2]) &&
    isLatitude(value[3])
  );
}

function isGapDetail(value: unknown): value is ElevationProfileGapDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const gap = value as Partial<ElevationProfileGapDetail>;
  return (
    isNonnegative(gap.feet) && isCoordinate(gap.from) && isCoordinate(gap.to)
  );
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isLongitude(value[0]) &&
    isLatitude(value[1])
  );
}

function isLongitude(value: unknown): boolean {
  return isFiniteNumber(value) && Math.abs(value) <= 180;
}

function isLatitude(value: unknown): boolean {
  return isFiniteNumber(value) && Math.abs(value) <= 90;
}

function isNonnegative(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const FEET_PER_MILE = 5280;
