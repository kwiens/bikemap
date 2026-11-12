import type { MigrateUpArgs } from '@payloadcms/db-postgres';

// Campus points are from NCES EDGE Public School Locations 2024–25.
// White Oak Bicycle Co-op lists Calvin Donaldson as open and the other two
// gardens as upcoming projects: https://www.whiteoakbicycle.org/our-impact
const schoolGardens = [
  {
    name: 'Soddy Elementary School Traffic Garden (Planned)',
    description:
      'White Oak Bicycle Co-op lists this school traffic garden as an upcoming project.',
    address: '260 School St, Soddy-Daisy, TN 37379',
    latitude: 35.2917,
    longitude: -85.1627,
  },
  {
    name: 'Lookout Valley Elementary School Traffic Garden (Planned)',
    description:
      'White Oak Bicycle Co-op lists this school traffic garden as an upcoming project.',
    address: '701 Browns Ferry Rd, Chattanooga, TN 37419',
    latitude: 35.0445,
    longitude: -85.357,
  },
  {
    name: 'Calvin Donaldson Elementary School Traffic Garden',
    description:
      'A school traffic garden where students practice biking and road safety. Check with the school about visitor access.',
    address: '927 W. 37th Street, Chattanooga, TN 37410',
    latitude: 35.0109,
    longitude: -85.3182,
  },
];

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const { docs } = await payload.find({
    collection: 'attractions',
    req,
    depth: 0,
    draft: true,
    pagination: false,
    select: { address: true, name: true },
    where: {
      city: { equals: 'chattanooga' },
      or: [
        { address: { in: schoolGardens.map(({ address }) => address) } },
        { name: { in: schoolGardens.map(({ name }) => name) } },
      ],
    },
  });

  // These three writes share the migration transaction. Payload records the
  // first published revision for each new attraction.
  for (const garden of schoolGardens) {
    if (
      docs.some(
        ({ address, name }) => address === garden.address || name === garden.name,
      )
    ) {
      continue;
    }
    await payload.create({
      collection: 'attractions',
      req,
      data: {
        ...garden,
        city: 'chattanooga',
        icon: 'bicycle',
        _status: 'published',
      },
    });
  }
}

export function down(): Promise<void> {
  // Keep editorial records and any later changes if the data migration is rolled back.
  return Promise.resolve();
}
