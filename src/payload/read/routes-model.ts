export interface StoredRoute {
  geom?: null | unknown;
  routeId?: null | string;
  sourceFeatureCount?: null | number;
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
): RouteFeatureCollection {
  const features = routes.flatMap((route) => {
    if (!route.geom || !route.routeId) {
      return [];
    }
    return [
      {
        geometry: route.geom,
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
