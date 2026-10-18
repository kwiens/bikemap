export interface FeatureSettings {
  attractions: boolean;
  bikeNetwork: boolean;
  bikeRentals: boolean;
  bikeResources: boolean;
  casualRoutes: boolean;
  conditionReporting: boolean;
  embeds: boolean;
  nationwideTrails: boolean;
  rideRecording: boolean;
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  attractions: true,
  bikeNetwork: true,
  bikeRentals: true,
  bikeResources: true,
  casualRoutes: true,
  conditionReporting: true,
  embeds: true,
  nationwideTrails: true,
  rideRecording: true,
};
