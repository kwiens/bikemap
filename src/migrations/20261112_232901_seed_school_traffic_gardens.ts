import type { MigrateUpArgs } from '@payloadcms/db-postgres';
import { schoolTrafficGardens } from './data/school-traffic-gardens';

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
        { address: { in: schoolTrafficGardens.map(({ address }) => address) } },
        { name: { in: schoolTrafficGardens.map(({ name }) => name) } },
      ],
    },
  });

  // These three writes share the migration transaction. Payload records the
  // first published revision for each new attraction.
  for (const garden of schoolTrafficGardens) {
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
        _status: 'published',
      },
    });
  }
}

export function down(): Promise<void> {
  // Keep editorial records and any later changes if the data migration is rolled back.
  return Promise.resolve();
}
