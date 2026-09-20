import { bikeResources } from '@/data/bike-resources';
import { bikeRoutes } from '@/data/bike-routes';
import { localResources } from '@/data/local-resources';
import { mapFeatures } from '@/data/map-features';
import {
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_ID,
  mountainBikeTrails as baseMountainBikeTrails,
  regionFor,
} from '@/data/mountain-bike-trails';
import type { CityData } from '@/data/cities/types';
import { applyChattanoogaMeasurements } from './measurements';

const HIDDEN_TRAILS = [
  'Tennessee Riverwalk',
  'River Walk',
  'South Chick Greenway',
  'South Chickamauga Creek Greenway',
];

const mountainBikeTrails = applyChattanoogaMeasurements(baseMountainBikeTrails);

export const chattanoogaData: CityData = {
  cityId: 'chattanooga',
  bikeRoutes,
  mapFeatures,
  bikeResources,
  localResources,
  mountainBikeTrails,
  regionFor,
  mountainBike: {
    layers: [
      {
        layerId: MTN_BIKE_LAYER_ID,
        sourceId: MTN_BIKE_SOURCE_ID,
        // Payload is authoritative. This deprecated static fallback is staged
        // for removal once fresh databases bootstrap without it and CMS outage
        // handling no longer depends on a public GeoJSON file.
        geojsonUrl: '/api/map/trails?city=chattanooga',
        geojsonFallbackUrl: '/data/chattanooga/trails.geojson',
        trailProp: 'Trail',
        matchBy: 'name',
      },
    ],
    hiddenTrails: HIDDEN_TRAILS,
  },
};
