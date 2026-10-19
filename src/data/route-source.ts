/**
 * Runtime route list supplied by Payload.
 *
 * Unlike trails, routes deliberately do not keep the checked-in city array as
 * a public fallback. Route geometry is database-owned, so showing stale cards
 * when the database has no matching geometry would create dead selections.
 */
import type { BikeRoute } from './bike-routes';
import { createContentStore } from './content-store';

export const routeStore = createContentStore<BikeRoute>();

export function getBikeRoutes(): BikeRoute[] {
  return routeStore.get();
}

/** Called during the page render before the dynamically imported map mounts. */
export function setBikeRoutes(next: BikeRoute[]): void {
  routeStore.set(next);
}

export function onBikeRoutesChange(notify: () => void): () => void {
  return routeStore.subscribe(notify);
}
