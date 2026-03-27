// Barrel re-export — all data modules accessible from '@/data/geo_data'
export type { BikeRoute } from './bike-routes';
export { bikeRoutes } from './bike-routes';

export {
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_LAYER,
  mountainBikeTrails,
  regionFor,
} from './mountain-bike-trails';
export type {
  MountainBikeTrail,
  ElevationProfile,
} from './mountain-bike-trails';

export type { MapFeature } from './map-features';
export { mapFeatures } from './map-features';

export type { BikeResource } from './bike-resources';
export { bikeResources } from './bike-resources';

export type { LocalResource } from './local-resources';
export { localResources } from './local-resources';

export type { BikeRentalLocation } from './gbfs';
