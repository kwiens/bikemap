import { useEffect } from 'react';
import { mountainBikeTrails, bikeRoutes } from '@/data/geo_data';
import { slugForTrail } from '@/data/mountain-bike-trails';
import { slugify } from '@/utils/string';
import { MAP_EVENTS } from '@/events';
import { onMapReady } from '@/utils/map-ready';

interface UrlDeepLinkOptions {
  /**
   * Whether to honour `?trail=`. Defaults to `true`; embed mode passes `false`
   * — it is Casual-only and does not attach the trail layers at all.
   */
  trails?: boolean;
  /**
   * Pre-decoded route slug. Embed mode passes the value `parseEmbedOptions`
   * already decoded so `?route=` has exactly one decoder — the two disagreed
   * about trimming, and a slug with surrounding whitespace was silently
   * dropped by this hook while the rest of the embed honoured it.
   */
  route?: string;
}

/**
 * Reads `?trail=` / `?route=` from the URL on mount and dispatches
 * `TRAIL_SELECT` / `ROUTE_SELECT` once the map is ready, so a shared link
 * auto-selects the right trail or route.
 */
export function useUrlDeepLink(options?: UrlDeepLinkOptions): void {
  const trailsEnabled = options?.trails ?? true;
  const routeOverride = options?.route;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trailSlug = trailsEnabled ? params.get('trail') : null;
    const routeSlug = routeOverride ?? params.get('route');

    if (!trailSlug && !routeSlug) return;

    const selectFromUrl = () => {
      if (trailSlug) {
        const found = mountainBikeTrails.find(
          (t) => slugForTrail(t) === trailSlug,
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

    return onMapReady(selectFromUrl);
  }, [trailsEnabled, routeOverride]);
}
