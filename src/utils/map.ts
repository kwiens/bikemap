import mapboxgl from 'mapbox-gl';
import type { BikeRoute } from '@/data/geo_data';

// Route utilities
export function createArrowSdfImage(size: number = 20): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const px = size * 0.25;
  const py = size * 0.1;
  ctx.moveTo(px, py);
  ctx.lineTo(size - px, size / 2);
  ctx.lineTo(px, size - py);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export function updateRouteOpacity(
  map: mapboxgl.Map,
  routes: BikeRoute[],
  selectedId: string | null,
  opacity: { selected: number; unselected: number },
) {
  routes.forEach((route) => {
    const targetOpacity =
      route.id === selectedId ? opacity.selected : opacity.unselected;
    try {
      map.setPaintProperty(route.id, 'line-opacity', targetOpacity);
    } catch (error) {
      console.error(`Error setting opacity for route ${route.id}:`, error);
    }
    const arrowLayerId = `${route.id}-arrows`;
    if (map.getLayer(arrowLayerId)) {
      map.setPaintProperty(arrowLayerId, 'icon-opacity', targetOpacity);
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

// Remove portions of line segments that overlap with other segments.
// Used to hide arrows where outbound and inbound paths share the same trail.
export function removeOverlappingSegments(
  features: GeoJSON.Feature[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const segments: number[][][] = [];
  for (const feature of features) {
    const geom = feature.geometry as
      | GeoJSON.LineString
      | GeoJSON.MultiLineString;
    if (geom.type === 'LineString') {
      segments.push(geom.coordinates);
    } else if (geom.type === 'MultiLineString') {
      segments.push(...geom.coordinates);
    }
  }

  if (segments.length === 0) return [];

  // Build spatial grid: cell -> set of segment indices with coords in that cell
  const cellSize = 0.0003; // ~33 meters
  const gridKey = (coord: number[]) =>
    `${Math.round(coord[0] / cellSize)},${Math.round(coord[1] / cellSize)}`;

  const grid = new Map<string, Set<number>>();
  for (let i = 0; i < segments.length; i++) {
    for (const coord of segments[i]) {
      const key = gridKey(coord);
      if (!grid.has(key)) grid.set(key, new Set());
      grid.get(key)?.add(i);
    }
  }

  // For each segment, keep only non-overlapping runs of coordinates
  const result: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let i = 0; i < segments.length; i++) {
    let currentRun: number[][] = [];

    for (const coord of segments[i]) {
      const key = gridKey(coord);
      const segIndices = grid.get(key);
      const isOverlapping =
        segIndices !== undefined &&
        segIndices.size > 1 &&
        [...segIndices].some((j) => j !== i);

      if (!isOverlapping) {
        currentRun.push(coord);
      } else {
        if (currentRun.length >= 2) {
          result.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: currentRun },
          });
        }
        currentRun = [];
      }
    }

    if (currentRun.length >= 2) {
      result.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: currentRun },
      });
    }
  }

  return result;
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
