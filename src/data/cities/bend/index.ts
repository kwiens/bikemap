import { faBicycle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { bikeRoutes as chattanoogaBikeRoutes } from '@/data/bike-routes';
import type { CityData } from '@/data/cities/types';
import { bendBikeResources } from './bike-resources';
import { bendMapFeatures } from './map-features';

export const bendData: CityData = {
  cityId: 'bend',
  bikeRoutes: [],
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
  mountainBikeTrails: [],
  trailMetadata: {},
  regionFor: () => 'Central Oregon',
  mountainBike: {
    layers: [],
    hiddenTrails: [],
    strayStyleLayers: ['Chatt_TPL_Trails-public'],
  },
  // The current Mapbox Studio style is Chattanooga-specific. Until Bend has its
  // own curated route layers, hide Chattanooga route layers when Bend is active.
  hiddenStyleLayerIds: chattanoogaBikeRoutes.map((route) => route.id),
};
