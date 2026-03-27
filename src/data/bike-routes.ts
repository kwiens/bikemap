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
  bounds?: mapboxgl.LngLatBounds; // Optional bounds of the route
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
  },
  {
    id: 'zoo-loop-v2-full-public',
    name: 'Zoo Loop',
    color: '#DC2626',
    description:
      'Fun route through the university to visit the zoo and a nearby park. Moderate traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
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
  },
  {
    id: 'South_Chick_GreenWay-public',
    name: 'South Chickamauga Creek',
    color: '#7C3AED',
    description: 'A new bike route to explore. No traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
  },
  {
    id: 'Chatt_TPL_Trails-public',
    name: 'Local Greenways',
    color: '#16A34A',
    description: 'Greenways and bike trails throughout the area.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
  },
  {
    id: 'cherokeeloop',
    name: 'Cherokee Loop',
    color: '#fbef05',
    description: 'Route into Red Bank. Moderate traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
  },
  {
    id: 'Moccasin Bend Route',
    name: 'Moccasin Bend Route',
    color: '#F97316',
    description:
      'Scenic route around Moccasin Bend with river views. No traffic.',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0,
  },
];
