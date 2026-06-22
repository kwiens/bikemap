// Classified bike-network overlay, derived from OpenStreetMap (see
// scripts/build_bend_bike_network.py) and served as a static GeoJSON per city.
// Attached at runtime (see ensureBikeNetworkSource in utils/map.ts) and toggled
// from the Casual sidebar. The five comfort classes are OSM-tag-derived and
// city-agnostic; a city opts in via CityData.bikeNetworkUrl. Data © OpenStreetMap.

export const BIKE_NETWORK_SOURCE_ID = 'bike-network-source';
// Base = the road-comfort tint (calm / caution), drawn thin underneath.
export const BIKE_NETWORK_BASE_LAYER_ID = 'bike-network-base';
// Infra = the bike-specific network (trails + lanes), drawn thicker on top.
export const BIKE_NETWORK_INFRA_LAYER_ID = 'bike-network-infra';

export interface NetworkClass {
  key: string;
  label: string;
  color: string;
  /** which sub-layer the class renders in */
  tier: 'base' | 'infra';
}

// Order here drives the sidebar legend (top = most bike-friendly).
export const BIKE_NETWORK_CLASSES: NetworkClass[] = [
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

export const BIKE_NETWORK_BASE_CLASSES = BIKE_NETWORK_CLASSES.filter(
  (c) => c.tier === 'base',
).map((c) => c.key);
export const BIKE_NETWORK_INFRA_CLASSES = BIKE_NETWORK_CLASSES.filter(
  (c) => c.tier === 'infra',
).map((c) => c.key);
