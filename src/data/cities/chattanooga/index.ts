import { bikeResources } from '@/data/bike-resources';
import { bikeRoutes } from '@/data/bike-routes';
import { localResources } from '@/data/local-resources';
import { mapFeatures } from '@/data/map-features';
import {
  GODSEY_LAYER_ID,
  GODSEY_SOURCE_LAYER,
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_ID,
  mountainBikeTrails,
  regionFor,
} from '@/data/mountain-bike-trails';
import { TRAIL_METADATA } from '@/data/trail-metadata';
import type { CityData } from '@/data/cities/types';

const HIDDEN_TRAILS = [
  'Tennessee Riverwalk',
  'River Walk',
  'South Chick Greenway',
  'South Chickamauga Creek Greenway',
];

export const chattanoogaData: CityData = {
  cityId: 'chattanooga',
  bikeRoutes,
  mapFeatures,
  bikeResources,
  localResources,
  mountainBikeTrails,
  trailMetadata: TRAIL_METADATA,
  regionFor,
  mountainBike: {
    layers: [
      {
        layerId: MTN_BIKE_LAYER_ID,
        sourceId: MTN_BIKE_SOURCE_ID,
        // Served from Payload after `db:seed:chattanooga`. The permitted GIS
        // snapshot used by the seed remains the fallback when the CMS is down
        // or has not been seeded yet.
        geojsonUrl: '/api/map/trails?city=chattanooga',
        geojsonFallbackUrl: '/data/chattanooga/trails.geojson',
        trailProp: 'Trail',
        matchBy: 'name',
      },
      {
        layerId: GODSEY_LAYER_ID,
        sourceLayer: GODSEY_SOURCE_LAYER,
        trailProp: 'Name',
        metadata: TRAIL_METADATA,
      },
    ],
    hiddenTrails: HIDDEN_TRAILS,
  },
  bikeRoutesUrl: '/data/chattanooga/routes.geojson',
  inlineBikeRouteIds: ['riverwalk-loop-v3-public'],
};
