// Barrel re-export — all data modules accessible from '@/data/geo_data'
import { activeCityData } from './cities';
import { hiddenStyleLayerIdsFor } from './mapbox-style';

export type { BikeRoute } from './bike-routes';
export const bikeRoutes = activeCityData.bikeRoutes;

export { MTN_BIKE_LAYER_ID } from './mountain-bike-trails';
export type {
  MountainBikeTrail,
  ElevationProfile,
} from './mountain-bike-trails';
export const mountainBikeConfig = activeCityData.mountainBike;
// Style-owned layers the active city doesn't manage (see mapbox-style.ts).
export const hiddenStyleLayerIds = hiddenStyleLayerIdsFor(activeCityData);
export const regionFor = activeCityData.regionFor;
export const bikeNetworkUrl = activeCityData.bikeNetworkUrl;
export const bikeRoutesUrl = activeCityData.bikeRoutesUrl;
export type { MapFeature } from './map-features';
export const mapFeatures = activeCityData.mapFeatures;

export type { BikeResource } from './bike-resources';
export const bikeResources = activeCityData.bikeResources;

export const localResources = activeCityData.localResources;

export type { BikeRentalLocation } from './gbfs';
