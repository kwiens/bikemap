import { bikeResources } from '@/data/bike-resources';
import { bikeRoutes } from '@/data/bike-routes';
import { localResources } from '@/data/local-resources';
import { mapFeatures } from '@/data/map-features';
import {
  GODSEY_LAYER_ID,
  GODSEY_SOURCE_LAYER,
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_ID,
  MTN_BIKE_SOURCE_LAYER,
  MTN_BIKE_TILESET_URL,
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
        tilesetUrl: MTN_BIKE_TILESET_URL,
        sourceLayer: MTN_BIKE_SOURCE_LAYER,
        trailProp: 'Trail',
      },
      {
        layerId: GODSEY_LAYER_ID,
        sourceLayer: GODSEY_SOURCE_LAYER,
        trailProp: 'Name',
        metadata: TRAIL_METADATA,
      },
    ],
    hiddenTrails: HIDDEN_TRAILS,
    strayStyleLayers: ['Chatt_TPL_Trails-public'],
  },
  hiddenStyleLayerIds: [],
};
