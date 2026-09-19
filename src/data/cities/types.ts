import type { BikeResource } from '@/data/bike-resources';
import type { BikeRoute } from '@/data/bike-routes';
import type { LocalResource } from '@/data/local-resources';
import type { MapFeature } from '@/data/map-features';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import type { TrailMeta } from '@/data/trail-metadata';

export type CityId = 'chattanooga' | 'bend';

export interface CuratedTrailLayerConfig {
  layerId: string;
  sourceLayer?: string;
  trailProp: string;
  sourceId?: string;
  tilesetUrl?: string;
  geojsonUrl?: string;
  // Static GeoJSON to draw when `geojsonUrl` is unreachable or answers with no
  // features — set it whenever `geojsonUrl` points at the database-backed API,
  // which can be down, unconfigured, or unseeded. With it set, the map fetches
  // the primary URL itself rather than handing it to Mapbox, which has no
  // answer to a failure. See `loadCuratedGeojson`.
  geojsonFallbackUrl?: string;
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
  regionFor: (recArea: string) => string;
  // Static GeoJSON URL for the classified bike-network overlay (Casual mode).
  // Undefined for cities without one (the toggle is hidden).
  bikeNetworkUrl?: string;
  // GeoJSON URL for curated routes attached at runtime and keyed by route id.
  // It may be a static file or a database-backed map API.
  bikeRoutesUrl?: string;
  // Optional subset expected from bikeRoutesUrl. Omit when the source contains
  // every configured route. A partial source keeps Studio layers as fallbacks.
  inlineBikeRouteIds?: string[];
}
