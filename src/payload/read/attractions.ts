import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { MapFeature } from '@/data/map-features';
import initialAttractions from '@/migrations/data/initial-attractions.json';

/** The map and its embed share the same published, city-scoped listings. */
export async function getCityAttractions(city: CityId): Promise<MapFeature[]> {
  if (!process.env.DATABASE_URL) {
    // Keep the standalone map usable when running without Payload.
    return initialAttractions
      .filter((row) => row.city === city)
      .map(({ city: _city, ...row }, index) => ({
        ...row,
        id: -(index + 1),
      }));
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
    return [];
  }
}
