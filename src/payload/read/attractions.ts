import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { MapFeature } from '@/data/map-features';
import attractionSeed from '@/data/attraction-seed.json';

/** The map and its embed share the same published, city-scoped listings. */
export async function getCityAttractions(city: CityId): Promise<MapFeature[]> {
  if (!process.env.DATABASE_URL) {
    return bundledAttractions(city);
  }

  try {
    const payload = await getPayload({ config });
    const { docs } = await payload.find({
      collection: 'attractions',
      overrideAccess: false,
      depth: 0,
      pagination: false,
      select: {
        name: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        icon: true,
      },
      sort: 'id',
      where: { city: { equals: city } },
    });
    return docs;
  } catch (error) {
    console.error(
      `Could not read attractions for "${city}" from Payload.`,
      error,
    );
    return bundledAttractions(city);
  }
}

function bundledAttractions(city: CityId): MapFeature[] {
  return attractionSeed
    .filter((row) => row.city === city)
    .map(({ city: _city, ...row }, index) => ({
      ...row,
      id: -(index + 1),
    }));
}
