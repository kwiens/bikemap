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
  // How a curated trail entry maps to features in this layer:
  //  - 'name'  (default): match trailProp against the trail's name
  //  - 'osmId': match the OSM_ID property against the trail's `osmIds` set.
  //    Used when the curated layer renders from the shared OSM trails tileset
  //    (nationwide), so trails are identified by exact way id, and the base
  //    layer filter is restricted to the union of curated ids.
  matchBy?: 'name' | 'osmId';
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
