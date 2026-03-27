// Barrel re-export — all data modules accessible from '@/data/geo_data'
export type { BikeRoute } from './bike-routes';
export { bikeRoutes } from './bike-routes';

export {
  SORBA_LAYER_ID,
  SORBA_SOURCE_LAYER,
  sorbaTrails,
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
