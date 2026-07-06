import {
  faFish,
  faPaw,
  faTrain,
  faGamepad,
  faHiking,
  faBicycle,
  faTree,
  faHorseHead,
  faPalette,
  faHorse,
  faHandsHelping,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

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
