// What the snippet builder needs to know about a city, resolved on the server
// from the request hostname.
//
// The builder must NOT import `@/data/geo_data`: that barrel binds the active
// city at module load, and on the server there is no `window`, so it resolves
// to NEXT_PUBLIC_CITY_ID rather than the host being served. On a per-request
// page like /about that meant ridebend.org rendered Chattanooga's routes into
// the HTML and then hydrated to Bend's. Passing this down as a prop also keeps
// both cities' trail datasets out of the page's client bundle.

import { cityDataById } from '@/data/cities';
import { resolveActiveCityId, cityConfigs } from '@/config/map.config';
import { slugify } from '@/utils/string';
import { MARKER_LAYERS, type EmbedLayer } from '@/utils/embed';

export interface EmbedRouteOption {
  id: string;
  name: string;
  slug: string;
}

export interface EmbedBuilderConfig {
  routes: EmbedRouteOption[];
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
): EmbedBuilderConfig {
  const cityId = resolveActiveCityId(hostname);
  const city = cityDataById[cityId];

  const canShow: Record<EmbedLayer, boolean> = {
    attractions: city.mapFeatures.length > 0,
    bikeResources: city.bikeResources.length > 0,
    bikeRentals: Boolean(cityConfigs[cityId].gbfs),
    bikeNetwork: Boolean(city.bikeNetworkUrl),
  };

  return {
    routes: city.bikeRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      slug: slugify(route.name),
    })),
    availableLayers: [...MARKER_LAYERS, 'bikeNetwork' as const].filter(
      (layer) => canShow[layer],
    ),
  };
}
