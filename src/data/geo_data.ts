// Barrel re-export — all data modules accessible from '@/data/geo_data'
import { activeCityData } from './cities';

export type { BikeRoute } from './bike-routes';
export const bikeRoutes = activeCityData.bikeRoutes;

export {
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_LAYER,
  MTN_BIKE_TILESET_URL,
  MTN_BIKE_SOURCE_ID,
  GODSEY_LAYER_ID,
  GODSEY_SOURCE_LAYER,
} from './mountain-bike-trails';
export type {
  MountainBikeTrail,
  ElevationProfile,
} from './mountain-bike-trails';
export const mountainBikeTrails = activeCityData.mountainBikeTrails;
export const mountainBikeConfig = activeCityData.mountainBike;
export const trailMetadata = activeCityData.trailMetadata;
export const hiddenStyleLayerIds = activeCityData.hiddenStyleLayerIds;
export const regionFor = activeCityData.regionFor;
export const bikeNetworkUrl = activeCityData.bikeNetworkUrl;
export const bikeRoutesUrl = activeCityData.bikeRoutesUrl;

export type { MapFeature } from './map-features';
export const mapFeatures = activeCityData.mapFeatures;

export type { BikeResource } from './bike-resources';
export const bikeResources = activeCityData.bikeResources;

export type { LocalResource } from './local-resources';
export const localResources = activeCityData.localResources;

export type { BikeRentalLocation } from './gbfs';
