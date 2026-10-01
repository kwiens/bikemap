/**
 * Sorts OSM ways into the classes the router prices.
 *
 * Client-safe and pure, so the rules can be tested without Overpass.
 */
import type { WayClass } from './graph';

const NO_BIKES = /^(no|private|dismount)$/;
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

/**
 * The class a way routes as, or null when a bike can't use it.
 *
 * Motorways and trunks are absent from the table, so they never route. A
 * footway counts only where bikes are explicitly allowed — most are
 * sidewalks — and a path or footway designated for bikes is a cycleway in all
 * but name.
 */
export function classifyWay(
  tags: Record<string, string>,
): { class: WayClass; hasBikeLane: boolean } | null {
  const bicycle = tags.bicycle ?? '';
  if (NO_BIKES.test(bicycle)) {
    return null;
  }
  if (
    /^(no|private)$/.test(tags.access ?? '') &&
    !BIKES_ALLOWED.test(bicycle)
  ) {
    return null;
  }

  let wayClass: WayClass | undefined = HIGHWAY_CLASSES[tags.highway ?? ''];
  if (!wayClass && (tags['mtb:scale'] || BIKES_ALLOWED.test(bicycle))) {
    wayClass = 'path';
  }
  if (!wayClass) {
    return null;
  }
  if (wayClass === 'footway' && !BIKES_ALLOWED.test(bicycle)) {
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
