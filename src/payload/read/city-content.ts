import 'server-only';

import type { FullCityContent } from '@/data/city-content';
import type { CityId } from '@/data/cities/types';
import { getCityAttractions } from './attractions';
import { getCityRoutes } from './routes';
import { getCityTrailSummaries } from './trails';

/**
 * Everything the public map needs from Payload for one city, read in
 * parallel. Readers handle unavailable data according to their content type:
 * routes return an empty list, the client retains its static trail summaries,
 * and the attractions reader returns its seed data when Payload is unavailable.
 */
export async function getCityContent(cityId: CityId): Promise<FullCityContent> {
  const [{ trails }, { routes }, attractions] = await Promise.all([
    getCityTrailSummaries(cityId),
    getCityRoutes(cityId),
    getCityAttractions(cityId),
  ]);
  return { cityId, routes, trails, attractions };
}
