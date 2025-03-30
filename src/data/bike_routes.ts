import { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faRoute } from '@fortawesome/free-solid-svg-icons';

export interface BikeRoute {
  id: string;           // Mapbox layer ID
  name: string;         // Display name
  color: string;        // Route color
  description: string;  // Route description
  icon: IconDefinition; // Route icon
  defaultWidth: number; // Default line width
  opacity: number;      // Line opacity (0-1)
  bounds?: mapboxgl.LngLatBounds; // Optional bounds of the route
}

export const bikeRoutes: BikeRoute[] = [
  {
    id: 'Riverfront Loop',
    name: 'Downtown Loop',
    color: '#5562EE',
    description: 'Explore the riverwalk and visit the aquarium',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
  {
    id: 'the-zoo-loop-v2',
    name: 'Zoo Loop',
    color: '#EE4D24',
    description: 'Fun route through the university to visit the zoo and a nearby park',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  }
]; 