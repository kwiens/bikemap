// What the snippet builder needs to know about a city, resolved on the server
// from the request hostname. The route choices are passed from Payload so a
// newly published Route is immediately available to embeds too.
//
// The builder must NOT import `@/data/geo_data`: that barrel binds the active
// city at module load, and on the server there is no `window`, so it resolves
// to NEXT_PUBLIC_CITY_ID rather than the host being served. On a per-request
// page like /about that meant ridebend.org rendered Chattanooga's routes into
// the HTML and then hydrated to Bend's. Passing this down as a prop also keeps
// both cities' trail datasets out of the page's client bundle.

import { cityDataById, type CityId } from '@/data/cities';
import type { BikeRoute } from '@/data/bike-routes';
import {
  slugForTrail,
  type MountainBikeTrail,
} from '@/data/mountain-bike-trails';
import { resolveActiveCityId, cityConfigs } from '@/config/map.config';
import { slugify } from '@/utils/string';
import { MARKER_LAYERS, type EmbedLayer } from '@/utils/embed';

export interface EmbedRouteOption {
  id: string;
  name: string;
  slug: string;
}

export interface EmbedTrailOption {
  id: string;
  name: string;
  slug: string;
}

export interface EmbedBuilderConfig {
  cityId: CityId;
  routes: EmbedRouteOption[];
  trails: EmbedTrailOption[];
  /** Layers this city can actually render, in `MARKER_LAYERS` order. */
  availableLayers: EmbedLayer[];
}

/**
 * Build the snippet-builder's options for the city serving `hostname`.
 *
 * Layer availability mirrors the sidebar's own gating (see `MapLayers` and
 * `BikeNetworkLayer`) so the form can't offer a layer whose `?layers=` value
 * the map would ignore — Chattanooga has no bike-network data, for instance.
 */
export function embedBuilderConfig(
  hostname: string | undefined,
  routes: BikeRoute[],
  trails: MountainBikeTrail[],
  cityQuery?: unknown,
): EmbedBuilderConfig {
  const cityId = resolveActiveCityId(hostname, cityQuery);
  const city = cityDataById[cityId];
  const availableTrails = trails.length > 0 ? trails : city.mountainBikeTrails;

  const canShow: Record<EmbedLayer, boolean> = {
    attractions: city.mapFeatures.length > 0,
    bikeResources: city.bikeResources.length > 0,
    bikeRentals: Boolean(cityConfigs[cityId].gbfs),
    bikeNetwork: Boolean(city.bikeNetworkUrl),
  };

  return {
    cityId,
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      slug: slugify(route.name),
    })),
    trails: trailOptions(availableTrails),
    availableLayers: [...MARKER_LAYERS, 'bikeNetwork' as const].filter(
      (layer) => canShow[layer],
    ),
  };
}

/**
 * One option per selectable slug. Neither `trailName` nor `slug` is unique in
 * Payload, and the embed's deep link resolves a slug to its first match, so a
 * second trail with the same slug could never be selected from the snippet.
 */
function trailOptions(trails: MountainBikeTrail[]): EmbedTrailOption[] {
  const bySlug = new Map<string, EmbedTrailOption>();
  for (const trail of trails) {
    const slug = slugForTrail(trail);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { id: slug, name: trail.displayName, slug });
    }
  }
  return [...bySlug.values()];
}
