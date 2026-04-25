import {
  faRoute,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

export interface BikeRoute {
  id: string; // Mapbox layer ID
  name: string; // Display name
  color: string; // Route color
  description: string; // Route description
  icon: IconDefinition; // Route icon
  defaultWidth: number; // Default line width
  opacity: number; // Line opacity (0-1)
  distance: number; // Route distance in miles
  defaultBounds?: [number, number, number, number]; // [swLng, swLat, neLng, neLat] fallback
  bounds?: mapboxgl.LngLatBounds; // Runtime-calculated bounds
}

export const bikeRoutes: BikeRoute[] = [
  {
    id: 'riverwalk-loop-v3-public',
    name: 'Riverwalk Loop',
    color: '#2563EB',
    description: 'Explore the riverwalk and visit the aquarium. Low traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 7.7,
    defaultBounds: [-85.326925, 35.028003, -85.301479, 35.061734],
  },
  {
    id: 'zoo-loop-v2-full-public',
    name: 'Zoo Loop',
    color: '#F97316',
    description:
      'Fun route through the university to visit the zoo and a nearby park. Moderate traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 5.4,
    defaultBounds: [-85.307614, 35.037548, -85.281097, 35.061733],
  },
  {
    id: 'Riverwalk_trail-test-public',
    name: 'Riverwalk Greenway Trail',
    color: '#059669',
    description:
      'Fun route through the university to visit the zoo and a nearby park. No traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 14.1,
    defaultBounds: [-85.328424, 35.009749, -85.230088, 35.102443],
  },
  {
    id: 'South_Chick_GreenWay-public',
    name: 'South Chickamauga Creek',
    color: '#7C3AED',
    description: 'A new bike route to explore. No traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 9.9,
    defaultBounds: [-85.260157, 35.042472, -85.212365, 35.089989],
  },
  {
    id: 'cherokeeloop',
    name: 'Cherokee Loop',
    color: '#fbef05',
    description: 'Route into Red Bank. Moderate traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 6.5,
    defaultBounds: [-85.320807, 35.060177, -85.300536, 35.089277],
  },
  {
    id: 'Moccasin Bend Route',
    name: 'Moccasin Bend Route',
    color: '#DC2626',
    description: 'Scenic route around Moccasin Bend with river views.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
    distance: 2.3,
    defaultBounds: [-85.333107, 35.052837, -85.305119, 35.062845],
  },
];
