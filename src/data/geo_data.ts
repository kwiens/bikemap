import { 
  faRoute, 
  faFish, 
  faPaw, 
  faTrain, 
  faGamepad, 
  faHiking,
  faBicycle, 
  faMountain, 
  faRoad, 
  faBolt, 
  faHandsHelping,
  faTree,
  faHorseHead,
  faInfoCircle,
  faPalette, 
  IconDefinition 
} from '@fortawesome/free-solid-svg-icons';
import { BikeRentalLocation } from './gbfs';

// Bike Routes Interface and Data
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
    id: 'riverwalk-loop-v3-public',
    name: 'Riverwalk Loop',
    color: '#2563EB',
    description: 'Explore the riverwalk and visit the aquarium',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
  {
    id: 'zoo-loop-v2-full-public',
    name: 'Zoo Loop',
    color: '#DC2626',
    description: 'Fun route through the university to visit the zoo and a nearby park',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
  {
    id: 'Riverwalk_trail-test-public',
    name: 'Riverwalk Greenway Trail',
    color: '#059669',
    description: 'Fun route through the university to visit the zoo and a nearby park',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
  {
    id: 'South_Chick_GreenWay-public',
    name: 'South Chickamauga Creek',
    color: '#7C3AED',
    description: 'A new bike route to explore',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
  {
    id: 'Chatt_TPL_Trails-public',
    name: 'Local Greenways',
    color: '#16A34A',
    description: 'A new bike route to explore',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1.0
  },
];

// Map Features Interface and Data
export interface MapFeature {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: IconDefinition;
}

export const mapFeatures: MapFeature[] = [
  {
    name: 'Tennessee Aquarium',
    description: "Immerse yourself in Chattanooga's underwater world—perfect for families and nature lovers!",
    address: '1 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0558333,
    longitude: -85.3111111,
    icon: faFish,
  },
  {
    name: 'Chattanooga Zoo at Warner Park',
    description: 'Meet furry, feathered, and scaly friends at the Chattanooga Zoo—an easy, fun stop for all ages.',
    address: '301 N Holtzclaw Avenue, Chattanooga, TN 37404',
    latitude: 35.0431,
    longitude: -85.2837,
    icon: faPaw,
  },
  {
    name: 'Tennessee Valley Railroad Museum',
    description: 'Step back in time on nostalgic train rides and explore vintage locomotives at the Railroad Museum.',
    address: '4119 Cromwell Road, Chattanooga, TN 37421',
    latitude: 35.0657,
    longitude: -85.2031,
    icon: faTrain,
  },
  {
    name: 'Chattanooga Pinball Museum',
    description: 'Score big with classic and modern pinball games—get your flippers ready for family-friendly fun!',
    address: '409 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0539,
    longitude: -85.3121,
    icon: faGamepad,
  },
  {
    name: 'Outdoor Chattanooga',
    description: 'Your go-to resource for outdoor adventure and recreation in Chattanooga.',
    address: '200 River Street, Chattanooga, TN 37405',
    latitude: 35.061111,
    longitude: -85.306389,
    icon: faHiking,
  },
  {
    name: "Stringer's Ridge",
    description: "Explore 92 acres of urban wilderness with multi-use trails offering panoramic views of Chattanooga.",
    address: "787 W Bell Avenue, Chattanooga, TN 37405",
    latitude: 35.0735,
    longitude: -85.3188,
    icon: faTree,
  },
  {
    name: "Reflection Riding Arboretum & Nature Center",
    description: "Discover over 300 acres of natural beauty featuring walking trails, native plants, and wildlife exhibits.",
    address: "400 Garden Road, Chattanooga, TN 37419",
    latitude: 35.0042,
    longitude: -85.3622,
    icon: faHorseHead,
  },
  {
    name: "Hunter Museum of American Art",
    description: "Art museum featuring works from the Hudson River School, American Impressionism, early modernism, and contemporary art. Offers tours and live performances.",
    address: "10 Bluff View Ave, Chattanooga, TN 37403",
    latitude: 35.0558333,
    longitude: -85.3061111,
    icon: faPalette,
  },
];

// Bike Resources Interface and Data
export interface BikeResource {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: IconDefinition;
}

export const bikeResources: BikeResource[] = [
  {
    name: 'Suck Creek Cycle',
    description: "Chattanooga's premier local bike shop offering premium brands and expert repairs for mountain biking enthusiasts.",
    address: '630 W Bell Avenue, Chattanooga, TN 37405',
    latitude: 35.0735,
    longitude: -85.3188,
    icon: faMountain,
  },
  {
    name: 'East Ridge Bicycles',
    description: 'Serving the community for over 35 years with a wide selection of bikes and professional fitting services.',
    address: '5910 Ringgold Road, Chattanooga, TN 37412',
    latitude: 34.9899,
    longitude: -85.1992,
    icon: faBicycle,
  },
  {
    name: 'Trek Bicycle Store',
    description: 'Official retailer offering a range of Trek bikes, accessories, and professional maintenance services.',
    address: '307 Manufacturers Road, Suite 117, Chattanooga, TN 37405',
    latitude: 35.0617,
    longitude: -85.3086,
    icon: faRoad,
  },
  {
    name: 'Chatt eBikes',
    description: "Chattanooga's premium electric bike shop specializing in sales, rentals, and services for electric bicycles.",
    address: '1404 McCallie Avenue, Suite 102, Chattanooga, TN 37404',
    latitude: 35.0375,
    longitude: -85.2845,
    icon: faBolt,
  },
  {
    name: 'Two Bikes Chattanooga',
    description: 'Non-profit bike shop transforming donated bikes into practical transportation for underserved community members.',
    address: '1810 E. Main Street, Suite 100, Chattanooga, TN 37404',
    latitude: 35.026111,
    longitude: -85.281111,
    icon: faHandsHelping,
  },
  {
    name: 'Pedego Electric Bikes Chattanooga',
    description: 'Specializing in electric bike sales, rentals, and services, offering a variety of models for all riders.',
    address: '191 River St, Chattanooga, TN 37405',
    latitude: 35.0625,
    longitude: -85.3077,
    icon: faBolt,
  },
  
  {
    name: 'Owen Cyclery',
    description: 'Family-owned shop since 1973, offering a wide range of bicycles, gear, and expert repair services.',
    address: '1920 Northpoint Blvd, Hixson, TN 37343',
    latitude: 35.1260,
    longitude: -85.2490,
    icon: faBicycle,
  },
];

// Local Resources Interface and Data
export interface LocalResource {
  name: string;
  description: string;
  url: string;
  icon: IconDefinition;
  color: string;
}

export const localResources: LocalResource[] = [
  {
    name: 'About This Map',
    description: 'This map is a guide to the best bike routes in Chattanooga. Made with ❤️ by iFixit, the free repair guide for every thing.',
    url: 'https://www.ifixit.com',
    icon: faInfoCircle,
    color: '#6B7280'
  },
  {
    name: 'Chattanooga City Bike Rentals',
    description: 'Find bike rentals throughout the city.',
    url: 'https://www.chattanooga.gov/bike-map',
    icon: faBicycle,
    color: '#6B7280'
  }
];

// Remove the hard-coded bikeRentalLocations array and export the type
export type { BikeRentalLocation }; 