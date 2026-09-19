import { faRoute } from '@fortawesome/free-solid-svg-icons';
import type { BikeRoute, RouteKind } from '@/data/bike-routes';

export interface StoredRoute {
  bounds?: null | unknown;
  color?: null | string;
  defaultWidth?: null | number;
  description?: null | string;
  distance?: null | number;
  geom?: null | unknown;
  geometrySource?: null | 'imported' | 'trail';
  hideArrows?: null | boolean;
  kind?: null | RouteKind;
  name?: null | string;
  opacity?: null | number;
  reverseArrowBounds?: null | unknown;
  reverseDirection?: null | boolean;
  routeId?: null | string;
  sourceFeatureCount?: null | number;
  sourceTrail?: null | number | string | { id?: number | string };
}

export interface StoredRouteTrail {
  bounds?: null | unknown;
  distance?: null | number;
  geom?: null | unknown;
}

export interface RouteFeatureCollection {
  features: {
    geometry: unknown;
    properties: { id: string; sourceFeatureCount?: number };
    type: 'Feature';
  }[];
  type: 'FeatureCollection';
}

/** Convert published Payload rows into the client map's GeoJSON contract. */
export function routeFeatureCollection(
  routes: StoredRoute[],
  sourceTrails: ReadonlyMap<string, StoredRouteTrail> = new Map(),
): RouteFeatureCollection {
  const features = routes.flatMap((route) => {
    const geometry = geometryFor(route, sourceTrails);
    if (!geometry || !route.routeId) {
      return [];
    }
    return [
      {
        geometry,
        properties: {
          id: route.routeId,
          ...(typeof route.sourceFeatureCount === 'number'
            ? { sourceFeatureCount: route.sourceFeatureCount }
            : {}),
        },
        type: 'Feature' as const,
      },
    ];
  });

  return { features, type: 'FeatureCollection' };
}

/** Convert the same rows into the display model consumed by Casual mode. */
export function publicBikeRoutes(
  routes: StoredRoute[],
  sourceTrails: ReadonlyMap<string, StoredRouteTrail> = new Map(),
): BikeRoute[] {
  return routes.flatMap((route) => {
    if (!route.routeId || !route.name || !geometryFor(route, sourceTrails)) {
      return [];
    }
    const trail = trailFor(route, sourceTrails);
    return [
      {
        id: route.routeId,
        name: route.name,
        color: route.color || '#2563EB',
        description: route.description || '',
        icon: faRoute,
        defaultWidth: route.defaultWidth ?? 8,
        opacity: route.opacity ?? 1,
        distance: trail?.distance ?? route.distance ?? 0,
        ...(route.kind ? { kind: route.kind } : {}),
        ...(route.hideArrows ? { hideArrows: true } : {}),
        ...(route.reverseDirection ? { reverseDirection: true } : {}),
        ...(boundsFor(trail?.bounds ?? route.bounds)
          ? { defaultBounds: boundsFor(trail?.bounds ?? route.bounds) }
          : {}),
        ...(reverseBoundsFor(route.reverseArrowBounds)
          ? { reverseArrowBounds: reverseBoundsFor(route.reverseArrowBounds) }
          : {}),
      },
    ];
  });
}

function sourceTrailId(route: StoredRoute): string | null {
  const relation = route.sourceTrail;
  if (typeof relation === 'number' || typeof relation === 'string') {
    return String(relation);
  }
  if (relation && typeof relation === 'object' && relation.id != null) {
    return String(relation.id);
  }
  return null;
}

function trailFor(
  route: StoredRoute,
  sourceTrails: ReadonlyMap<string, StoredRouteTrail>,
): StoredRouteTrail | undefined {
  if (route.geometrySource !== 'trail') {
    return undefined;
  }
  const id = sourceTrailId(route);
  return id ? sourceTrails.get(id) : undefined;
}

function geometryFor(
  route: StoredRoute,
  sourceTrails: ReadonlyMap<string, StoredRouteTrail>,
): unknown | null {
  return route.geometrySource === 'trail'
    ? (trailFor(route, sourceTrails)?.geom ?? null)
    : (route.geom ?? null);
}

function boundsFor(
  value: unknown,
): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite)
    ? (numbers as [number, number, number, number])
    : undefined;
}

function reverseBoundsFor(
  value: unknown,
): [number, number, number, number][] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const bounds = value.flatMap((candidate) => {
    const parsed = boundsFor(candidate);
    return parsed ? [parsed] : [];
  });
  return bounds.length > 0 ? bounds : undefined;
}
