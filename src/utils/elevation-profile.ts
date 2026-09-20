import type {
  ElevationProfile,
  ElevationProfileGapDetail,
} from '@/data/mountain-bike-trails';

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
    !isFiniteNumber(profile.distance) ||
    !isFiniteNumber(profile.gain) ||
    !isFiniteNumber(profile.loss) ||
    !isFiniteNumber(profile.min) ||
    !isFiniteNumber(profile.max) ||
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

function isProfilePoint(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    isFiniteNumber(value[2]) &&
    isFiniteNumber(value[3])
  );
}

function isGapDetail(value: unknown): value is ElevationProfileGapDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const gap = value as Partial<ElevationProfileGapDetail>;
  return (
    isFiniteNumber(gap.feet) && isCoordinate(gap.from) && isCoordinate(gap.to)
  );
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
