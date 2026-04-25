import {
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

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
    icon: faBicycle,
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
    address: '307 Manufacturers Rd #117, Chattanooga, TN 37405',
    latitude: 35.0628386,
    longitude: -85.3138755,
    icon: faBicycle,
  },
  {
    name: 'Chatt eBikes',
    description:
      "Chattanooga's premium electric bike shop specializing in sales, rentals, and services for electric bicycles.",
    address: '1404 McCallie Avenue, Suite 102, Chattanooga, TN 37404',
    latitude: 35.03825275443797,
    longitude: -85.28125452877657,
    icon: faBicycle,
  },
  {
    name: 'Two Bikes Chattanooga',
    description:
      'Non-profit bike shop transforming donated bikes into practical transportation for underserved community members.',
    address: '1810 E. Main Street, Suite 100, Chattanooga, TN 37404',
    latitude: 35.026111,
    longitude: -85.281111,
    icon: faBicycle,
  },
  {
    name: 'Loblolly Bike Shop',
    description:
      'Bike sales, rentals, and services, offering a variety of models for all riders.',
    address: '191 River St, Chattanooga, TN 37405',
    latitude: 35.0625,
    longitude: -85.3077,
    icon: faBicycle,
  },
  {
    name: 'Mountaintown Bicycles',
    description:
      'Certified dealer offering an extensive selection of new bicycles and e-bikes with professional repair services.',
    address: '5337 Ringgold Road, Chattanooga, TN 37412',
    latitude: 34.9949081,
    longitude: -85.2322395,
    icon: faBicycle,
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
