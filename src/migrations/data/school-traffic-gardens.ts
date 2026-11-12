// Campus points are from NCES EDGE Public School Locations 2024–25.
// White Oak Bicycle Co-op lists Calvin Donaldson as open and the other two
// gardens as upcoming projects: https://www.whiteoakbicycle.org/our-impact
export const schoolTrafficGardens = [
  {
    city: 'chattanooga',
    icon: 'bicycle',
    name: 'Soddy Elementary School Traffic Garden (Planned)',
    description:
      'White Oak Bicycle Co-op lists this school traffic garden as an upcoming project.',
    address: '260 School St, Soddy-Daisy, TN 37379',
    latitude: 35.2917,
    longitude: -85.1627,
  },
  {
    city: 'chattanooga',
    icon: 'bicycle',
    name: 'Lookout Valley Elementary School Traffic Garden (Planned)',
    description:
      'White Oak Bicycle Co-op lists this school traffic garden as an upcoming project.',
    address: '701 Browns Ferry Rd, Chattanooga, TN 37419',
    latitude: 35.0445,
    longitude: -85.357,
  },
  {
    city: 'chattanooga',
    icon: 'bicycle',
    name: 'Calvin Donaldson Elementary School Traffic Garden',
    description:
      'A school traffic garden where students practice biking and road safety. Check with the school about visitor access.',
    address: '927 W. 37th Street, Chattanooga, TN 37410',
    latitude: 35.0109,
    longitude: -85.3182,
  },
] as const;
