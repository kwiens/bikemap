import { useEffect } from 'react';
import { getBikeRoutes } from '@/data/route-source';
import { getMountainBikeTrails } from '@/data/trail-source';
import { slugForTrail } from '@/data/mountain-bike-trails';
import { slugify } from '@/utils/string';
import { MAP_EVENTS } from '@/events';
import { onMapReady } from '@/utils/map-ready';

interface UrlDeepLinkOptions {
  /**
   * Whether to honour `?trail=`. Defaults to `true`; embed mode passes `false`
   * for Casual embeds, which do not attach the trail layers.
   */
  trails?: boolean;
  /** Whether to honour `?route=`. Defaults to `true`. */
  routes?: boolean;
  /**
   * Pre-decoded route slug. Embed mode passes the value `parseEmbedOptions`
   * already decoded so `?route=` has exactly one decoder — the two disagreed
   * about trimming, and a slug with surrounding whitespace was silently
   * dropped by this hook while the rest of the embed honoured it.
   */
  route?: string;
  /** Pre-decoded trail slug, parallel to `route`. */
  trail?: string;
}

/**
 * Reads `?trail=` / `?route=` from the URL on mount and dispatches
 * `TRAIL_SELECT` / `ROUTE_SELECT` once the map is ready, so a shared link
 * auto-selects the right trail or route.
 */
export function useUrlDeepLink(options?: UrlDeepLinkOptions): void {
  const trailsEnabled = options?.trails ?? true;
  const routesEnabled = options?.routes ?? true;
  const routeOverride = options?.route;
  const trailOverride = options?.trail;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trailSlug = trailsEnabled
      ? (trailOverride ?? params.get('trail'))
      : null;
    const routeSlug = routesEnabled
      ? (routeOverride ?? params.get('route'))
      : null;

    if (!trailSlug && !routeSlug) return;

    const selectFromUrl = () => {
      if (trailSlug) {
        const found = getMountainBikeTrails().find(
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
        const found = getBikeRoutes().find(
          (r) => slugify(r.name) === routeSlug,
        );
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
  }, [routeOverride, routesEnabled, trailOverride, trailsEnabled]);
}
