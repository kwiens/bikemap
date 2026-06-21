import type { BikeResource } from '@/data/bike-resources';
import type { BikeRoute } from '@/data/bike-routes';
import type { LocalResource } from '@/data/local-resources';
import type { MapFeature } from '@/data/map-features';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import type { TrailMeta } from '@/data/trail-metadata';

export type CityId = 'chattanooga' | 'bend';

export interface CuratedTrailLayerConfig {
  layerId: string;
  sourceLayer: string;
  trailProp: string;
  sourceId?: string;
  tilesetUrl?: string;
  metadata?: Record<string, TrailMeta>;
}

export interface MountainBikeCityConfig {
  layers: CuratedTrailLayerConfig[];
  hiddenTrails: string[];
  strayStyleLayers: string[];
}

export interface CityData {
  cityId: CityId;
  bikeRoutes: BikeRoute[];
  mapFeatures: MapFeature[];
  bikeResources: BikeResource[];
  localResources: LocalResource[];
  mountainBikeTrails: MountainBikeTrail[];
  trailMetadata: Record<string, TrailMeta>;
  mountainBike: MountainBikeCityConfig;
  hiddenStyleLayerIds: string[];
  regionFor: (recArea: string) => string;
}
