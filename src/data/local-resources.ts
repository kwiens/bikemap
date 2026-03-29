import {
  faInfoCircle,
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

export interface LocalResource {
  name: string;
  description: string;
  url: string;
  icon: IconDefinition;
  colorTheme: 'blue' | 'green' | 'purple' | 'gray';
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
    colorTheme: 'gray',
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
    colorTheme: 'gray',
  },
];
