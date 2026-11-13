/**
 * Everything the public map reads from Payload for one city, as one bundle.
 *
 * The server builds it in `src/payload/read/city-content.ts`. The client
 * publishes routes and trails into their stores before rendering the map.
 * Attractions pass through as city-checked props. Add new readers to
 * `getCityContent` and include their results in `FullCityContent`.
 */
import { activeCityId } from '@/config/map.config';
import type { BikeRoute } from './bike-routes';
import type { CityId } from './cities/types';
import type { ContentStore } from './content-store';
import type { MapFeature } from './map-features';
import type { MountainBikeTrail } from './mountain-bike-trails';
import { routeStore } from './route-source';
import { trailStore } from './trail-source';

export interface CityContentData {
  routes: BikeRoute[];
  trails: MountainBikeTrail[];
}

type ContentStores = {
  [K in keyof CityContentData]: ContentStore<CityContentData[K][number]>;
};

const contentStores: ContentStores = {
  routes: routeStore,
  trails: trailStore,
};

/**
 * What a page publishes. Each page loads only what it renders (an embed loads
 * its selected route family), so every list is optional; `cityId` is the city the server
 * resolved from the request host.
 */
export interface CityContent extends Partial<CityContentData> {
  cityId: CityId;
  // Marker consumers receive the city-checked list as a prop.
  attractions?: MapFeature[];
}

/** What the full page reads: every list, so a type added to `CityContentData`
 *  but not to `getCityContent` is a type error, not a silently empty store. */
export type FullCityContent = CityContentData &
  Required<Pick<CityContent, 'cityId' | 'attractions'>>;

/**
 * Publish server-read content into the stores, during render, before any
 * consumer reads. They don't change for the life of the page, so this needs
 * no state and triggers no re-render.
 *
 * Server and browser resolve the city independently — the server from the
 * request host, the browser from `window.location`. A response served for
 * another host must not replace this city's content, so they have to agree.
 * Returns whether anything was published.
 */
export function publishCityContent(content: CityContent): boolean {
  if (content.cityId !== activeCityId) return false;
  for (const key of Object.keys(contentStores) as (keyof CityContentData)[]) {
    const list = content[key];
    if (list) {
      (contentStores[key] as ContentStore<unknown>).set(list);
    }
  }
  return true;
}
