import type mapboxgl from 'mapbox-gl';
import type { BikeRoute } from '@/data/geo_data';
import { fetchRouteCollection } from './route-source';

export interface RouteFeatures {
  routeId: string;
  features: GeoJSON.Feature[];
}

interface RouteExportOptions {
  bikeRoutesUrl?: string;
  inlineBikeRouteIds?: string[];
}

/** Load route geometry from inline GeoJSON and/or Mapbox Studio layers. */
export async function loadRouteFeatures(
  map: mapboxgl.Map,
  routes: BikeRoute[],
  options: RouteExportOptions,
): Promise<RouteFeatures[]> {
  const { bikeRoutesUrl, inlineBikeRouteIds } = options;
  const inlineIds = new Set(
    bikeRoutesUrl
      ? (inlineBikeRouteIds ?? routes.map((route) => route.id))
      : [],
  );
  const inlineFeatures = new Map<string, GeoJSON.Feature>();

  if (bikeRoutesUrl) {
    const collection = await fetchRouteCollection(bikeRoutesUrl);
    if (collection) {
      for (const feature of collection.features) {
        const id = feature.properties?.id;
        if (typeof id === 'string') {
          inlineFeatures.set(id, feature);
        }
      }
    }
  }

  const styleLayers = map.getStyle().layers;
  return routes.flatMap((route) => {
    const inlineFeature = inlineIds.has(route.id)
      ? inlineFeatures.get(route.id)
      : undefined;
    if (inlineFeature) {
      return [{ routeId: route.id, features: [inlineFeature] }];
    }

    const layer = styleLayers.find((item) => item.id === route.id);
    if (!layer?.source || !layer['source-layer']) {
      return [];
    }
    const features = map.querySourceFeatures(layer.source, {
      sourceLayer: layer['source-layer'],
    });
    return [{ routeId: route.id, features: [...features] }];
  });
}
