import mapboxgl from 'mapbox-gl';
import type { BikeRoute } from '@/data/geo_data';

// Route utilities
export function updateRouteOpacity(
  map: mapboxgl.Map,
  routes: BikeRoute[],
  selectedId: string | null,
  opacity: { selected: number; unselected: number },
) {
  routes.forEach((route) => {
    try {
      map.setPaintProperty(
        route.id,
        'line-opacity',
        route.id === selectedId ? opacity.selected : opacity.unselected,
      );
    } catch (error) {
      console.error(`Error setting opacity for route ${route.id}:`, error);
    }
  });
}

export function calculateZoomForBounds(
  bounds: mapboxgl.LngLatBounds,
  isMobile: boolean,
): number {
  const latDiff = bounds.getNorth() - bounds.getSouth();
  const lngDiff = bounds.getEast() - bounds.getWest();
  const maxDiff = Math.max(latDiff, lngDiff);

  return isMobile
    ? Math.max(11, 15 - maxDiff * 100)
    : Math.max(13, 17 - maxDiff * 100);
}

export function calculateRouteBounds(
  map: mapboxgl.Map,
  layer: mapboxgl.AnyLayer,
): mapboxgl.LngLatBounds | null {
  const sourceId = layer.source;
  const sourceLayer = layer['source-layer'];

  if (!sourceId || !sourceLayer) {
    return null;
  }

  // Query all features in this layer
  const features = map.querySourceFeatures(sourceId, {
    sourceLayer: sourceLayer,
  });

  if (features.length === 0) {
    return null;
  }

  // Calculate bounds of all features
  const bounds = new mapboxgl.LngLatBounds();

  features.forEach((feature: GeoJSON.Feature) => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach((coord: GeoJSON.Position) => {
        bounds.extend(coord as [number, number]);
      });
    } else if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates.forEach((line: GeoJSON.Position[]) => {
        line.forEach((coord: GeoJSON.Position) => {
          bounds.extend(coord as [number, number]);
        });
      });
    }
  });

  // Only return bounds if we have valid coordinates
  if (bounds.getNorth() !== undefined && bounds.getSouth() !== undefined) {
    return bounds;
  }

  return null;
}

// Coordinate utilities
export function findLocationInArray<
  T extends { latitude: number; longitude: number },
>(items: T[], coordinates: [number, number]): T | undefined {
  return items.find(
    (item) =>
      item.longitude === coordinates[0] && item.latitude === coordinates[1],
  );
}

export function findMarkerByCoordinates(
  markers: mapboxgl.Marker[],
  coordinates: [number, number],
): mapboxgl.Marker | undefined {
  return markers.find((marker) => {
    const pos = marker.getLngLat();
    return pos.lng === coordinates[0] && pos.lat === coordinates[1];
  });
}

// Geocoding utility
export async function geocodeAddress(
  address: string,
  accessToken: string,
): Promise<[number, number] | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${accessToken}&limit=1`,
    );

    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return [lng, lat];
    }
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}
