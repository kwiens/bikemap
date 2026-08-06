import { faBicycle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { bikeRoutes as chattanoogaBikeRoutes } from '@/data/bike-routes';
import type { CityData } from '@/data/cities/types';
import { bendBikeResources } from './bike-resources';
import { bendBikeRoutes } from './bike-routes.data';
import { bendMapFeatures } from './map-features';
import { bendMountainBikeTrails } from './mountain-bike-trails.data';

// Bend's curated MTB trails render from generated GeoJSON so the map uses the
// same ordered/clipped OSM-derived geometry as each elevation profile.
const BEND_MTB_LAYER_ID = 'bend-mtb-trails';
const BEND_MTB_SOURCE_ID = 'bend-mtb-trails-source';

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
        sourceId: BEND_MTB_SOURCE_ID,
        // Served from Payload. public/data/bend/trails.geojson is still the
        // source the database was seeded from, and remains the fallback if the
        // API is unreachable.
        geojsonUrl: '/api/map/trails?city=bend',
        trailProp: 'Trail',
        matchBy: 'name',
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
