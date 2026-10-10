/**
 * Everything the public map reads from Payload for one city, as one bundle.
 *
 * The server builds it (`src/payload/read/city-content.ts`) and the client
 * publishes it into the content stores during render. To add a Payload object
 * type to the public map:
 *
 *   1. add its array to `CityContentData` and a store to `contentStores`
 *      (create the store next to the type's existing `*-source.ts`),
 *   2. read it in `getCityContent` on the server,
 *   3. have consumers call the store's `get()` at render time.
 *
 * Nothing in HomeClient or the page changes.
 */
import { activeCityId } from '@/config/map.config';
import type { BikeRoute } from './bike-routes';
import type { CityId } from './cities/types';
import type { ContentStore } from './content-store';
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
 * What a page publishes. Each page loads only what it renders (the embed has
 * no trails), so every list is optional; `cityId` is the city the server
 * resolved from the request host.
 */
export interface CityContent extends Partial<CityContentData> {
  cityId: CityId;
}

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
