import mapboxgl from 'mapbox-gl';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import { SORBA_LAYER_ID, SORBA_SOURCE_LAYER, regionFor } from '@/data/geo_data';

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
  _route: BikeRoute,
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

// SORBA trail utilities
export function calculateTrailBounds(
  map: mapboxgl.Map,
  trailName: string,
): mapboxgl.LngLatBounds | null {
  const features = map.querySourceFeatures('composite', {
    sourceLayer: SORBA_SOURCE_LAYER,
    filter: ['==', ['get', 'Trail'], trailName],
  });

  if (features.length === 0) return null;

  const bounds = new mapboxgl.LngLatBounds();
  for (const feature of features) {
    if (feature.geometry.type === 'LineString') {
      for (const coord of feature.geometry.coordinates) {
        bounds.extend(coord as [number, number]);
      }
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates) {
        for (const coord of line) {
          bounds.extend(coord as [number, number]);
        }
      }
    }
  }

  if (bounds.getNorth() !== undefined && bounds.getSouth() !== undefined) {
    return bounds;
  }
  return null;
}

export function initTrailBoundsFromDefaults(trails: MountainBikeTrail[]): void {
  for (const trail of trails) {
    if (!trail.bounds && trail.defaultBounds) {
      const [swLng, swLat, neLng, neLat] = trail.defaultBounds;
      trail.bounds = new mapboxgl.LngLatBounds([swLng, swLat], [neLng, neLat]);
    }
  }
}

export function getAreaBounds(
  trails: MountainBikeTrail[],
  areaName: string,
): mapboxgl.LngLatBounds | null {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoords = false;
  for (const trail of trails) {
    if (trail.recArea !== areaName && regionFor(trail.recArea) !== areaName)
      continue;
    if (trail.bounds) {
      bounds.extend(trail.bounds);
      hasCoords = true;
    } else if (trail.defaultBounds) {
      const [swLng, swLat, neLng, neLat] = trail.defaultBounds;
      bounds.extend([swLng, swLat]);
      bounds.extend([neLng, neLat]);
      hasCoords = true;
    }
  }
  return hasCoords ? bounds : null;
}

export function calculateAllTrailBounds(
  map: mapboxgl.Map,
  trails: MountainBikeTrail[],
): void {
  for (const trail of trails) {
    if (!trail.bounds) {
      trail.bounds = calculateTrailBounds(map, trail.trailName) ?? undefined;
    }
  }
}

// Data-driven color expression for SORBA trails based on difficulty rating
const SORBA_COLOR_EXPRESSION: mapboxgl.Expression = [
  'match',
  ['get', 'rating'],
  'easy',
  '#16A34A',
  'intermediate',
  '#2563EB',
  'advanced',
  '#DC2626',
  'expert',
  '#1F2937',
  '#6B7280', // unrated fallback
];

export function initSorbaColors(map: mapboxgl.Map): void {
  try {
    map.setPaintProperty(SORBA_LAYER_ID, 'line-color', SORBA_COLOR_EXPRESSION);
  } catch {
    // SORBA layer may not exist yet
  }
}

export function updateSorbaOpacity(
  map: mapboxgl.Map,
  selectedTrailName: string | null,
): void {
  try {
    if (selectedTrailName) {
      map.setPaintProperty(SORBA_LAYER_ID, 'line-opacity', [
        'case',
        ['==', ['get', 'Trail'], selectedTrailName],
        0.9,
        0.15,
      ]);
      map.setPaintProperty(SORBA_LAYER_ID, 'line-width', [
        'case',
        ['==', ['get', 'Trail'], selectedTrailName],
        6,
        3,
      ]);
    } else {
      map.setPaintProperty(SORBA_LAYER_ID, 'line-opacity', 0.15);
      map.setPaintProperty(SORBA_LAYER_ID, 'line-width', 3);
    }
  } catch {
    // SORBA layer may not exist yet
  }
}

export function highlightSorbaArea(
  map: mapboxgl.Map,
  trails: MountainBikeTrail[],
  areaName: string,
): void {
  const trailNames = trails
    .filter((t) => t.recArea === areaName || regionFor(t.recArea) === areaName)
    .map((t) => t.trailName);

  if (trailNames.length === 0) return;

  try {
    map.setPaintProperty(SORBA_LAYER_ID, 'line-opacity', [
      'match',
      ['get', 'Trail'],
      trailNames,
      0.9,
      0.1,
    ]);
    map.setPaintProperty(SORBA_LAYER_ID, 'line-width', [
      'match',
      ['get', 'Trail'],
      trailNames,
      4,
      2,
    ]);
  } catch (error) {
    console.error('Error highlighting SORBA area:', error);
  }
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
