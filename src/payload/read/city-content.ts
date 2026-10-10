import 'server-only';

import type { FullCityContent } from '@/data/city-content';
import type { CityId } from '@/data/cities/types';
import { getCityRoutes } from './routes';
import { getCityTrailSummaries } from './trails';

/**
 * Everything the public map needs from Payload for one city, read in
 * parallel. Each reader never throws — no database, an unreachable one, or an
 * empty result all come back as an empty list and the client keeps its
 * checked-in fallback — so neither does this.
 *
 * A new Payload object type joins here (and in `CityContentData`), not in the
 * page.
 */
export async function getCityContent(cityId: CityId): Promise<FullCityContent> {
  const [{ trails }, { routes }] = await Promise.all([
    getCityTrailSummaries(cityId),
    getCityRoutes(cityId),
  ]);
  return { cityId, routes, trails };
}
