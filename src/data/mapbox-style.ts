import { bikeRoutes as chattanoogaBikeRoutes } from '@/data/bike-routes';
import type { CityData } from './cities/types';

// What the shared Mapbox Studio style bakes in, declared once per style.
//
// The current style is Chattanooga's: it carries Chattanooga's curated route
// layers plus a stray TPL trails layer the app doesn't manage. Every other
// city must hide the layers it doesn't own — computed here from the style
// declaration, so a new city never has to import another city's data just to
// hide its layers. When each city gets its own Studio style, this collapses to
// a per-style manifest.
export const STYLE_OWNED_ROUTE_LAYER_IDS = chattanoogaBikeRoutes.map(
  (route) => route.id,
);

// Dedicated Chattanooga route tilesets baked into the shared Studio style.
// Both supported cities render curated routes from a single runtime GeoJSON
// source, so these can be removed from the composite source before map load.
export const STYLE_OWNED_ROUTE_TILESET_IDS = [
  'swuller.a2odh3pm',
  'swuller.b0vlobi3',
  'swuller.28lbdneb',
  'swuller.1uitnldp',
  'swuller.1me2wgb5',
  'swuller.6mn7meup',
];

// Orphan layers baked into the style that no city manages — hidden for all.
export const STYLE_STRAY_LAYER_IDS = ['Chatt_TPL_Trails-public'];

/**
 * Style-owned route layers the given city must hide: everything the style
 * bakes in except the city's own routes.
 */
export function hiddenStyleLayerIdsFor(city: CityData): string[] {
  if (city.bikeRoutesUrl) return STYLE_OWNED_ROUTE_LAYER_IDS;
  const ownRouteIds = new Set(city.bikeRoutes.map((route) => route.id));
  return STYLE_OWNED_ROUTE_LAYER_IDS.filter((id) => !ownRouteIds.has(id));
}
