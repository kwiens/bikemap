import { regionFor } from './geo_data';
import type { MountainBikeTrail } from './mountain-bike-trails';

/**
 * The sidebar heading a trail sits under.
 *
 * Prefers the region stored on the trail's recreation area, which is editable
 * in the admin, and falls back to the city's built-in `REGION_MAP` for trails
 * that came from the checked-in data or whose area has no region set.
 *
 * Every grouping call site should use this rather than `regionFor` directly,
 * so an area's region can be changed without a deploy.
 */
export function regionOf(trail: MountainBikeTrail): string {
  return trail.region || regionFor(trail.recArea);
}
