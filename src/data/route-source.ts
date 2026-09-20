/**
 * Runtime route list supplied by Payload.
 *
 * Unlike trails, routes deliberately do not keep the checked-in city array as
 * a public fallback. Route geometry is database-owned, so showing stale cards
 * when the database has no matching geometry would create dead selections.
 */
import type { BikeRoute } from './bike-routes';

let routes: BikeRoute[] = [];
const subscribers = new Set<() => void>();

export function getBikeRoutes(): BikeRoute[] {
  return routes;
}

/** Called during the page render before the dynamically imported map mounts. */
export function setBikeRoutes(next: BikeRoute[]): void {
  if (next === routes) {
    return;
  }
  routes = next;
  for (const notify of subscribers) {
    notify();
  }
}

export function onBikeRoutesChange(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}
