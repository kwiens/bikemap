// Classified Bend bike network overlay, derived from OpenStreetMap by
// scripts/build_bend_bike_network.py and served as a static GeoJSON. Attached at
// runtime (see ensureBendNetworkSource in utils/map.ts) and toggled from the
// Casual sidebar. Inspired by bendbikes.org; data is © OpenStreetMap.

export const BEND_NETWORK_SOURCE_ID = 'bend-network-source';
// Base = the road-comfort tint (calm / caution), drawn thin underneath.
export const BEND_NETWORK_BASE_LAYER_ID = 'bend-network-base';
// Infra = the bike-specific network (trails + lanes), drawn thicker on top.
export const BEND_NETWORK_INFRA_LAYER_ID = 'bend-network-infra';

export interface NetworkClass {
  key: string;
  label: string;
  color: string;
  /** which sub-layer the class renders in */
  tier: 'base' | 'infra';
}

// Order here drives the sidebar legend (top = most bike-friendly).
export const BEND_NETWORK_CLASSES: NetworkClass[] = [
  { key: 'paved_trail', label: 'Paved trail', color: '#16A34A', tier: 'infra' },
  {
    key: 'unpaved_trail',
    label: 'Unpaved trail',
    color: '#B45309',
    tier: 'infra',
  },
  { key: 'bike_lane', label: 'Bike lane', color: '#2563EB', tier: 'infra' },
  { key: 'calm_street', label: 'Calm street', color: '#84CC16', tier: 'base' },
  { key: 'caution', label: 'Use caution', color: '#F97316', tier: 'base' },
];

export const BEND_NETWORK_BASE_CLASSES = BEND_NETWORK_CLASSES.filter(
  (c) => c.tier === 'base',
).map((c) => c.key);
export const BEND_NETWORK_INFRA_CLASSES = BEND_NETWORK_CLASSES.filter(
  (c) => c.tier === 'infra',
).map((c) => c.key);
