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
  faHorse,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import type { BikeRentalLocation } from './gbfs';

// Bike Routes Interface and Data
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
    description:
      "Immerse yourself in Chattanooga's underwater world—perfect for families and nature lovers!",
    address: '1 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0558333,
    longitude: -85.3111111,
    icon: faFish,
  },
  {
    name: 'Chattanooga Zoo at Warner Park',
    description:
      'Meet furry, feathered, and scaly friends at the Chattanooga Zoo—an easy, fun stop for all ages.',
    address: '301 N Holtzclaw Avenue, Chattanooga, TN 37404',
    latitude: 35.0431,
    longitude: -85.2837,
    icon: faPaw,
  },
  {
    name: 'Tennessee Valley Railroad Museum',
    description:
      'Step back in time on nostalgic train rides and explore vintage locomotives at the Railroad Museum.',
    address: '4119 Cromwell Road, Chattanooga, TN 37421',
    latitude: 35.0671239,
    longitude: -85.2062965,
    icon: faTrain,
  },
  {
    name: 'Chattanooga Pinball Museum',
    description:
      'Score big with classic and modern pinball games—get your flippers ready for family-friendly fun!',
    address: '409 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0539,
    longitude: -85.3121,
    icon: faGamepad,
  },
  {
    name: 'Outdoor Chattanooga',
    description:
      'Your go-to resource for outdoor adventure and recreation in Chattanooga.',
    address: '200 River Street, Chattanooga, TN 37405',
    latitude: 35.0611726,
    longitude: -85.3069177,
    icon: faHiking,
  },
  {
    name: 'Coolidge Carousel',
    description:
      'A classic carousel in a historic carousel house. Perfect for families.',
    address: '150 River Street, Chattanooga, TN 37405',
    latitude: 35.061099,
    longitude: -85.3072955,
    icon: faHorse,
  },
  {
    name: "Stringer's Ridge",
    description:
      'Explore 92 acres of urban wilderness with multi-use trails offering panoramic views of Chattanooga.',
    address: '787 W Bell Avenue, Chattanooga, TN 37405',
    latitude: 35.0735,
    longitude: -85.3188,
    icon: faTree,
  },
  {
    name: 'Reflection Riding Arboretum & Nature Center',
    description:
      'Discover over 300 acres of natural beauty featuring walking trails, native plants, and wildlife exhibits.',
    address: '400 Garden Road, Chattanooga, TN 37419',
    latitude: 35.0110238,
    longitude: -85.3666888,
    icon: faHorseHead,
  },
  {
    name: 'Hunter Museum of American Art',
    description:
      'Art museum featuring works from the Hudson River School, American Impressionism, early modernism, and contemporary art. Offers tours and live performances.',
    address: '10 Bluff View Ave, Chattanooga, TN 37403',
    latitude: 35.0558333,
    longitude: -85.3061111,
    icon: faPalette,
  },
  {
    name: 'Red Bank Bicycle Traffic Garden',
    description:
      'A miniature streetscape where kids and families can practice cycling skills and learn road safety in a fun, car-free environment.',
    address: 'Red Bank, TN 37415',
    latitude: 35.1402265,
    longitude: -85.2792273,
    icon: faBicycle,
  },
  {
    name: 'South Chattanooga Community Center Bicycle Traffic Garden',
    description:
      'Practice cycling skills at a community center offering recreational programs, sports facilities, and gathering spaces.',
    address: 'South Chattanooga, TN 37408',
    latitude: 35.0093301,
    longitude: -85.3224917,
    icon: faHandsHelping,
  },
  {
    name: 'Pioneer Frontier Park Traffic Garden',
    description:
      'A scenic park with a traffic garden, open green spaces, playgrounds, and trails perfect for a family bike ride.',
    address: 'East Brainerd, TN 37421',
    latitude: 34.9957601,
    longitude: -85.2424457,
    icon: faTree,
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
    description:
      "Chattanooga's premier local bike shop offering premium brands and expert repairs for mountain biking enthusiasts.",
    address: '630 W Bell Avenue, Chattanooga, TN 37405',
    latitude: 35.0735,
    longitude: -85.3188,
    icon: faMountain,
  },
  {
    name: 'East Ridge Bicycles',
    description:
      'Serving the community for over 35 years with a wide selection of bikes and professional fitting services.',
    address: '5910 Ringgold Road, Chattanooga, TN 37412',
    latitude: 34.9899,
    longitude: -85.1992,
    icon: faBicycle,
  },
  {
    name: 'Trek Bicycle Store',
    description:
      'Official retailer offering a range of Trek bikes, accessories, and professional maintenance services.',
    address: '307 Manufacturers Road, Suite 117, Chattanooga, TN 37405',
    latitude: 35.0617,
    longitude: -85.3086,
    icon: faRoad,
  },
  {
    name: 'Chatt eBikes',
    description:
      "Chattanooga's premium electric bike shop specializing in sales, rentals, and services for electric bicycles.",
    address: '1404 McCallie Avenue, Suite 102, Chattanooga, TN 37404',
    latitude: 35.03825275443797,
    longitude: -85.28125452877657,
    icon: faBolt,
  },
  {
    name: 'Two Bikes Chattanooga',
    description:
      'Non-profit bike shop transforming donated bikes into practical transportation for underserved community members.',
    address: '1810 E. Main Street, Suite 100, Chattanooga, TN 37404',
    latitude: 35.026111,
    longitude: -85.281111,
    icon: faHandsHelping,
  },
  {
    name: 'Pedego Electric Bikes Chattanooga',
    description:
      'Specializing in electric bike sales, rentals, and services, offering a variety of models for all riders.',
    address: '191 River St, Chattanooga, TN 37405',
    latitude: 35.0625,
    longitude: -85.3077,
    icon: faBolt,
  },

  {
    name: 'Owen Cyclery',
    description:
      'Family-owned shop since 1973, offering a wide range of bicycles, gear, and expert repair services.',
    address: '1920 Northpoint Blvd, Hixson, TN 37343',
    latitude: 35.126,
    longitude: -85.249,
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
  secondaryDescription?: string;
  secondaryUrl?: string;
  secondaryLinkText?: string;
}

export const localResources: LocalResource[] = [
  {
    name: 'About This Map',
    description:
      'This map is a guide to the best bike routes in Chattanooga. Made with ❤️ by iFixit, the free repair guide for every thing.',
    url: 'https://www.ifixit.com',
    icon: faInfoCircle,
    color: '#6B7280',
    secondaryDescription:
      "Dedicated to the memory of our friend and collaborator. Donate to Yoseph's Bikes to help children access the joy of riding.",
    secondaryUrl: 'https://www.whiteoakbicycle.org/yoyobikes',
    secondaryLinkText: "Yoseph's Bikes",
  },
  {
    name: 'Chattanooga City Bike Rentals',
    description:
      'Chattanooga City Bike Rentals: Find 24-7 bike rentals throughout the city.',
    url: 'https://bikechatt.com',
    icon: faBicycle,
    color: '#6B7280',
  },
];

// Remove the hard-coded bikeRentalLocations array and export the type
export type { BikeRentalLocation };
