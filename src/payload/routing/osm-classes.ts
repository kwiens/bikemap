/**
 * Sorts OSM ways into the classes the router prices.
 *
 * Client-safe and pure, so the rules can be tested without Overpass.
 */
import type { WayClass } from './graph';

const NO_BIKES = /^(no|private|dismount)$/;
const NO_ACCESS = /^(no|private)$/;
const BIKES_ALLOWED = /^(yes|designated|permissive)$/;

/** `cycleway*` values that mean the road itself carries a bike lane. */
const LANE_VALUES = new Set(['buffered_lane', 'lane', 'track']);
const LANE_KEYS = [
  'cycleway',
  'cycleway:both',
  'cycleway:left',
  'cycleway:right',
];

const HIGHWAY_CLASSES: Record<string, WayClass> = {
  bridleway: 'path',
  cycleway: 'cycleway',
  footway: 'footway',
  living_street: 'street',
  path: 'path',
  pedestrian: 'footway',
  primary: 'primary',
  primary_link: 'primary',
  residential: 'street',
  road: 'street',
  secondary: 'secondary',
  secondary_link: 'secondary',
  service: 'service',
  tertiary: 'tertiary',
  tertiary_link: 'tertiary',
  track: 'path',
  unclassified: 'street',
};

export const ROUTABLE_HIGHWAYS = Object.keys(HIGHWAY_CLASSES).join('|');

/**
 * Public footways, including sidewalks and crossings, can be traced when
 * bicycle access is unspecified. A path designated for bikes is a cycleway.
 */
export function classifyWay(
  tags: Record<string, string>,
): { class: WayClass; hasBikeLane: boolean } | null {
  const bicycle = tags.bicycle ?? '';
  const isBikeAccessExplicit = BIKES_ALLOWED.test(bicycle);
  if (
    tags.area === 'yes' ||
    NO_BIKES.test(bicycle) ||
    (NO_ACCESS.test(tags.access ?? '') && !isBikeAccessExplicit)
  ) {
    return null;
  }

  const highway = tags.highway ?? '';
  let wayClass = Object.hasOwn(HIGHWAY_CLASSES, highway)
    ? HIGHWAY_CLASSES[highway]
    : undefined;
  if (
    /^(motorway|trunk)(_link)?$/.test(highway) ||
    (highway === 'service' &&
      /^(driveway|parking_aisle|drive-through)$/.test(tags.service ?? ''))
  ) {
    return null;
  }
  if (!wayClass && (tags['mtb:scale'] || isBikeAccessExplicit)) {
    wayClass = 'path';
  }
  if (
    !wayClass ||
    (wayClass === 'footway' &&
      NO_ACCESS.test(tags.foot ?? '') &&
      !isBikeAccessExplicit)
  ) {
    return null;
  }
  if (
    (wayClass === 'path' || wayClass === 'footway') &&
    bicycle === 'designated'
  ) {
    wayClass = 'cycleway';
  }

  return {
    class: wayClass,
    hasBikeLane: LANE_KEYS.some((key) => LANE_VALUES.has(tags[key] ?? '')),
  };
}
