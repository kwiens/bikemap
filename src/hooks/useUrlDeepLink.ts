import { useEffect } from 'react';
import { mountainBikeTrails, bikeRoutes } from '@/data/geo_data';
import { slugify } from '@/utils/string';
import { MAP_EVENTS } from '@/events';

/**
 * Reads `?trail=` / `?route=` from the URL on mount and dispatches
 * `TRAIL_SELECT` / `ROUTE_SELECT` once the map is ready (`window.__mapReady`
 * or the `MAP_READY` event), so a shared link auto-selects the right trail
 * or route.
 *
 * `trails` defaults to `true`; pass `{ trails: false }` to ignore the `trail`
 * param — used in embed mode, which is Casual-only and has no trails layer.
 */
export function useUrlDeepLink(options?: { trails?: boolean }): void {
  const trailsEnabled = options?.trails ?? true;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trailSlug = trailsEnabled ? params.get('trail') : null;
    const routeSlug = params.get('route');

    if (!trailSlug && !routeSlug) return;

    const selectFromUrl = () => {
      if (trailSlug) {
        const found = mountainBikeTrails.find(
          (t) => slugify(t.trailName) === trailSlug,
        );
        if (found) {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
              detail: { trailName: found.trailName },
            }),
          );
        }
      } else if (routeSlug) {
        const found = bikeRoutes.find((r) => slugify(r.name) === routeSlug);
        if (found) {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
              detail: { routeId: found.id },
            }),
          );
        }
      }
    };

    // If the map already initialized before this effect ran, select now.
    // Otherwise wait for the MAP_READY event.
    if ((window as unknown as Record<string, boolean>).__mapReady) {
      selectFromUrl();
      return;
    }
    window.addEventListener(MAP_EVENTS.MAP_READY, selectFromUrl, {
      once: true,
    });
    return () =>
      window.removeEventListener(MAP_EVENTS.MAP_READY, selectFromUrl);
  }, [trailsEnabled]);
}
