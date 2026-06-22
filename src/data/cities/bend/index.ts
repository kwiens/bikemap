import { faBicycle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { bikeRoutes as chattanoogaBikeRoutes } from '@/data/bike-routes';
import type { CityData } from '@/data/cities/types';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
} from '@/data/osm-trails';
import { bendBikeResources } from './bike-resources';
import { bendBikeRoutes } from './bike-routes.data';
import { bendMapFeatures } from './map-features';
import { bendMountainBikeTrails } from './mountain-bike-trails.data';

// Bend's curated MTB trails render from the shared nationwide OSM trails tileset
// (the curated entries carry the matched OSM way ids). Match by OSM_ID, and the
// base layer filter is restricted to the union of curated ids (see map.ts).
const BEND_MTB_LAYER_ID = 'bend-mtb-trails';

// recArea (trail "complex" from bendbikerides) -> geographic region for the
// sidebar grouping. Areas not listed fall back to 'Central Oregon'.
const REGION_MAP: Record<string, string> = {
  "Phil's Trail Complex": 'Bend',
  'Wanoga Sno Park': 'Bend',
  'Swampy Lakes': 'Bend',
  'North of Skyliner': 'Bend',
  'East of Bend': 'Bend',
  'Bend Area': 'Bend',
  'Mt. Bachelor Bike Park': 'Cascade Lakes',
  Sunriver: 'Cascade Lakes',
  'Cline Butte': 'Redmond & Cline Buttes',
  Maston: 'Redmond & Cline Buttes',
  Madras: 'Redmond & Cline Buttes',
  Sisters: 'Sisters',
  Oakridge: 'Oakridge & Willamette Pass',
  'Waldo Lake': 'Oakridge & Willamette Pass',
  McKenzie: 'Oakridge & Willamette Pass',
  'La Pine': 'Oakridge & Willamette Pass',
};

export const bendData: CityData = {
  cityId: 'bend',
  bikeRoutes: bendBikeRoutes,
  mapFeatures: bendMapFeatures,
  bikeResources: bendBikeResources,
  localResources: [
    {
      name: 'About This Map',
      description:
        'This map is a guide to biking in Bend. Local routes, trails, and resources will be added over time.',
      url: '/about',
      icon: faInfoCircle,
      colorTheme: 'gray',
    },
    {
      name: 'Veo Bend',
      description:
        'Veo shared vehicles are available around Bend through the Veo app.',
      url: 'https://www.veoride.com/',
      icon: faBicycle,
      colorTheme: 'gray',
    },
  ],
  mountainBikeTrails: bendMountainBikeTrails,
  trailMetadata: {},
  regionFor: (recArea: string) => REGION_MAP[recArea] ?? 'Central Oregon',
  mountainBike: {
    layers: [
      {
        layerId: BEND_MTB_LAYER_ID,
        sourceId: OSM_TRAILS_SOURCE_ID,
        tilesetUrl: OSM_TRAILS_TILEJSON_URL,
        sourceLayer: OSM_TRAILS_SOURCE_LAYER,
        trailProp: 'OSM_ID',
        matchBy: 'osmId',
      },
    ],
    hiddenTrails: [],
    strayStyleLayers: ['Chatt_TPL_Trails-public'],
  },
  // The current Mapbox Studio style is Chattanooga-specific. Until Bend has its
  // own curated route layers, hide Chattanooga route layers when Bend is active.
  hiddenStyleLayerIds: chattanoogaBikeRoutes.map((route) => route.id),
  // OSM-derived classified bike network (Casual mode overlay).
  bikeNetworkUrl: '/data/bend/bike-network.geojson',
  // Curated greenway routes (geometry attached at runtime from GeoJSON).
  bikeRoutesUrl: '/data/bend/routes.geojson',
};
