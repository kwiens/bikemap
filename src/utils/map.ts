import mapboxgl from 'mapbox-gl';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import {
  MTN_BIKE_LAYER_ID,
  MTN_BIKE_SOURCE_LAYER,
  GODSEY_LAYER_ID,
  GODSEY_SOURCE_LAYER,
  regionFor,
} from '@/data/geo_data';
import {
  TRAIL_METADATA,
  RATING_COLORS,
  UNRATED_COLOR,
} from '@/data/trail-metadata';

// Route utilities
export function updateRouteOpacity(
  map: mapboxgl.Map,
  routes: BikeRoute[],
  selectedId: string | null,
  opacity: { selected: number; unselected: number },
) {
  routes.forEach((route) => {
    try {
      const isSelected = route.id === selectedId;
      map.setPaintProperty(
        route.id,
        'line-opacity',
        isSelected ? opacity.selected : opacity.unselected,
      );

      // Update casing layer
      const casingId = `${route.id}-casing`;
      if (map.getLayer(casingId)) {
        map.setPaintProperty(
          casingId,
          'line-opacity',
          isSelected ? opacity.selected * 0.8 : opacity.unselected * 0.8,
        );
        map.setPaintProperty(
          casingId,
          'line-width',
          isSelected ? route.defaultWidth + 4 : route.defaultWidth + 2,
        );
      }
    } catch (error) {
      console.error(`Error setting opacity for route ${route.id}:`, error);
    }
  });
}

export function flyToBounds(
  map: mapboxgl.Map,
  bounds: mapboxgl.LngLatBounds,
): void {
  map.fitBounds(bounds, {
    padding: 60,
    duration: 1000,
    essential: true,
  });
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

// Mountain bike trail utilities
export function calculateTrailBounds(
  map: mapboxgl.Map,
  trailName: string,
): mapboxgl.LngLatBounds | null {
  const features = map.querySourceFeatures('composite', {
    sourceLayer: MTN_BIKE_SOURCE_LAYER,
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

export function initRouteBoundsFromDefaults(routes: BikeRoute[]): void {
  for (const route of routes) {
    if (!route.bounds && route.defaultBounds) {
      const [swLng, swLat, neLng, neLat] = route.defaultBounds;
      route.bounds = new mapboxgl.LngLatBounds([swLng, swLat], [neLng, neLat]);
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

// Trail layer configuration — each entry represents a Mapbox layer
// containing mountain bike trails with its own property names
interface TrailLayerConfig {
  layerId: string;
  sourceLayer: string;
  trailProp: string; // feature property containing the trail name
  // If the tileset has a 'rating' property, use it directly for colors.
  // Otherwise set to false and colors are derived from TRAIL_METADATA.
  hasRatingProp: boolean;
}

// Build a color expression from TRAIL_METADATA for layers without a rating property
function buildMetadataColorExpression(trailProp: string): mapboxgl.Expression {
  const entries: (string | mapboxgl.Expression)[] = [
    'match',
    ['get', trailProp],
  ];
  for (const [rawName, meta] of Object.entries(TRAIL_METADATA)) {
    entries.push(rawName);
    entries.push(RATING_COLORS[meta.rating] ?? UNRATED_COLOR);
  }
  entries.push(UNRATED_COLOR);
  return entries as mapboxgl.Expression;
}

const RATING_COLOR_EXPRESSION: mapboxgl.Expression = [
  'match',
  ['get', 'rating'],
  ...Object.entries(RATING_COLORS).flat(),
  UNRATED_COLOR,
];

const TRAIL_LAYERS: TrailLayerConfig[] = [
  {
    layerId: MTN_BIKE_LAYER_ID,
    sourceLayer: MTN_BIKE_SOURCE_LAYER,
    trailProp: 'Trail',
    hasRatingProp: true,
  },
  {
    layerId: GODSEY_LAYER_ID,
    sourceLayer: GODSEY_SOURCE_LAYER,
    trailProp: 'Name',
    hasRatingProp: false,
  },
];

function casingId(layerId: string): string {
  return `${layerId} Casing`;
}
function glowId(layerId: string): string {
  return `${layerId} Glow`;
}
function hitId(layerId: string): string {
  return `${layerId} Hit`;
}

export { TRAIL_LAYERS };

export function initMtnBikeColors(map: mapboxgl.Map): void {
  for (const cfg of TRAIL_LAYERS) {
    try {
      if (map.getLayer(cfg.layerId)) {
        const colorExpr = cfg.hasRatingProp
          ? RATING_COLOR_EXPRESSION
          : buildMetadataColorExpression(cfg.trailProp);
        map.setPaintProperty(cfg.layerId, 'line-color', colorExpr);
      }
    } catch {
      // Layer may not exist yet
    }
  }
}

export function initMtnBikeLayers(map: mapboxgl.Map): void {
  for (const cfg of TRAIL_LAYERS) {
    const layer = map.getLayer(cfg.layerId) as
      | mapboxgl.LayerSpecification
      | undefined;
    if (!layer) continue;

    const source = (layer as { source?: string }).source ?? 'composite';
    const cId = casingId(cfg.layerId);
    const gId = glowId(cfg.layerId);
    const hId = hitId(cfg.layerId);

    if (!map.getLayer(cId)) {
      map.addLayer(
        {
          id: cId,
          type: 'line',
          source,
          'source-layer': cfg.sourceLayer,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 5,
            'line-opacity': 0.25,
          },
        },
        cfg.layerId,
      );
    }

    if (!map.getLayer(gId)) {
      map.addLayer(
        {
          id: gId,
          type: 'line',
          source,
          'source-layer': cfg.sourceLayer,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 0,
            'line-opacity': 0,
            'line-blur': 10,
          },
        },
        cId,
      );
    }

    if (!map.getLayer(hId)) {
      map.addLayer({
        id: hId,
        type: 'line',
        source,
        'source-layer': cfg.sourceLayer,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(0,0,0,0)',
          'line-width': 20,
          'line-opacity': 0,
        },
      });
    }

    map.setLayoutProperty(cfg.layerId, 'line-cap', 'round');
    map.setLayoutProperty(cfg.layerId, 'line-join', 'round');
    map.setLayoutProperty(cfg.layerId, 'line-round-limit', 0.1);
  }
}

function setTrailOpacity(
  map: mapboxgl.Map,
  cfg: TrailLayerConfig,
  selectedTrailName: string | null,
): void {
  const prop = cfg.trailProp;
  // For layers using metadata mapping, find the raw feature value
  let matchValue = selectedTrailName;
  if (selectedTrailName && !cfg.hasRatingProp) {
    const entry = Object.entries(TRAIL_METADATA).find(
      ([, meta]) => meta.displayName === selectedTrailName,
    );
    matchValue = entry ? entry[0] : selectedTrailName;
  }

  const cId = casingId(cfg.layerId);
  const gId = glowId(cfg.layerId);

  if (selectedTrailName) {
    map.setPaintProperty(cfg.layerId, 'line-opacity', [
      'case',
      ['==', ['get', prop], matchValue],
      0.9,
      0.15,
    ]);
    map.setPaintProperty(cfg.layerId, 'line-width', [
      'case',
      ['==', ['get', prop], matchValue],
      4,
      2,
    ]);

    if (map.getLayer(cId)) {
      map.setPaintProperty(cId, 'line-opacity', [
        'case',
        ['==', ['get', prop], matchValue],
        0.9,
        0.25,
      ]);
      map.setPaintProperty(cId, 'line-width', [
        'case',
        ['==', ['get', prop], matchValue],
        6,
        4,
      ]);
    }

    if (map.getLayer(gId)) {
      map.setPaintProperty(gId, 'line-opacity', [
        'case',
        ['==', ['get', prop], matchValue],
        0.7,
        0,
      ]);
      map.setPaintProperty(gId, 'line-width', [
        'case',
        ['==', ['get', prop], matchValue],
        24,
        0,
      ]);
    }
  } else {
    map.setPaintProperty(cfg.layerId, 'line-opacity', 0.15);
    map.setPaintProperty(cfg.layerId, 'line-width', 2);

    if (map.getLayer(cId)) {
      map.setPaintProperty(cId, 'line-opacity', 0.25);
      map.setPaintProperty(cId, 'line-width', 4);
    }

    if (map.getLayer(gId)) {
      map.setPaintProperty(gId, 'line-opacity', 0);
      map.setPaintProperty(gId, 'line-width', 0);
    }
  }
}

export function updateMtnBikeOpacity(
  map: mapboxgl.Map,
  selectedTrailName: string | null,
): void {
  for (const cfg of TRAIL_LAYERS) {
    try {
      if (map.getLayer(cfg.layerId)) {
        setTrailOpacity(map, cfg, selectedTrailName);
      }
    } catch {
      // Layer may not exist yet
    }
  }
}

export function highlightMtnBikeArea(
  map: mapboxgl.Map,
  trails: MountainBikeTrail[],
  areaName: string,
): void {
  const matchedTrails = trails.filter(
    (t) => t.recArea === areaName || regionFor(t.recArea) === areaName,
  );
  if (matchedTrails.length === 0) return;

  for (const cfg of TRAIL_LAYERS) {
    if (!map.getLayer(cfg.layerId)) continue;

    // Map our trail names to raw feature property values
    const rawNames = matchedTrails.map((t) => {
      if (!cfg.hasRatingProp) {
        const entry = Object.entries(TRAIL_METADATA).find(
          ([, meta]) => meta.displayName === t.trailName,
        );
        return entry ? entry[0] : t.trailName;
      }
      return t.trailName;
    });

    const cId = casingId(cfg.layerId);
    const gId = glowId(cfg.layerId);

    try {
      map.setPaintProperty(cfg.layerId, 'line-opacity', [
        'match',
        ['get', cfg.trailProp],
        rawNames,
        0.9,
        0.1,
      ]);
      map.setPaintProperty(cfg.layerId, 'line-width', [
        'match',
        ['get', cfg.trailProp],
        rawNames,
        3,
        2,
      ]);

      if (map.getLayer(cId)) {
        map.setPaintProperty(cId, 'line-opacity', [
          'match',
          ['get', cfg.trailProp],
          rawNames,
          0.6,
          0.1,
        ]);
        map.setPaintProperty(cId, 'line-width', [
          'match',
          ['get', cfg.trailProp],
          rawNames,
          5,
          4,
        ]);
      }

      if (map.getLayer(gId)) {
        map.setPaintProperty(gId, 'line-opacity', 0);
        map.setPaintProperty(gId, 'line-width', 0);
      }
    } catch (error) {
      console.error('Error highlighting mountain bike area:', error);
    }
  }
}

// Recorded ride layer management
const RIDE_SOURCE_ID = 'recorded-ride';
const RIDE_LINE_ID = 'recorded-ride-line';
const RIDE_LINE_COLOR = '#ff6b35';

export function addRideLayer(
  map: mapboxgl.Map,
  coordinates: [number, number][],
): void {
  removeRideLayer(map);

  map.addSource(RIDE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    },
  });

  map.addLayer({
    id: RIDE_LINE_ID,
    type: 'line',
    source: RIDE_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': RIDE_LINE_COLOR,
      'line-width': 4,
      'line-opacity': 0.85,
    },
  });
}

export function updateRideLayer(
  map: mapboxgl.Map,
  coordinates: [number, number][],
): void {
  const source = map.getSource(RIDE_SOURCE_ID) as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (source) {
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    });
  } else {
    addRideLayer(map, coordinates);
  }
}

export function removeRideLayer(map: mapboxgl.Map): void {
  if (map.getLayer(RIDE_LINE_ID)) map.removeLayer(RIDE_LINE_ID);
  if (map.getSource(RIDE_SOURCE_ID)) map.removeSource(RIDE_SOURCE_ID);
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
