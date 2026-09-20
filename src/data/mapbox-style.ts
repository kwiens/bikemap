import {
  bikeRoutes as chattanoogaBikeRoutes,
  type BikeRoute,
} from '@/data/bike-routes';
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
// They can be removed when every route for the active city is runtime-owned.
export const STYLE_OWNED_ROUTE_TILESET_IDS = [
  'swuller.a2odh3pm',
  'swuller.b0vlobi3',
  'swuller.28lbdneb',
  'swuller.1uitnldp',
  'swuller.1me2wgb5',
  'swuller.6mn7meup',
];

// Orphan and superseded layers baked into the style that no city manages.
// Keep these hidden until they are deleted from the shared Studio style.
export const STYLE_STRAY_LAYER_IDS = [
  'Chatt_TPL_Trails-public',
  'Godsey Ridge Trails',
];

/** Hide route layers the active city's static style manifest does not own. */
export function hiddenStyleLayerIdsFor(city: CityData): string[] {
  const ownRouteIds = new Set(city.bikeRoutes.map((route) => route.id));
  return STYLE_OWNED_ROUTE_LAYER_IDS.filter((id) => !ownRouteIds.has(id));
}

/** Hide every known style route except published Routes that explicitly use it. */
export function inactiveStyleRouteLayerIds(
  routes: BikeRoute[],
  runtimeIds: string[],
): string[] {
  const runtime = new Set(runtimeIds);
  const visibleStudioIds = new Set(
    routes.flatMap((route) =>
      route.geometrySource === 'studio' ||
      (!route.geometrySource && !runtime.has(route.id))
        ? [route.id]
        : [],
    ),
  );
  return STYLE_OWNED_ROUTE_LAYER_IDS.filter((id) => !visibleStudioIds.has(id));
}
