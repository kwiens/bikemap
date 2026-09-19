import type * as GeoJSON from 'geojson';
import mapboxgl from 'mapbox-gl';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import { mountainBikeConfig, trailMetadata } from '@/data/geo_data';
import { regionOf } from '@/data/trail-region';
import {
  getMountainBikeTrails,
  onMountainBikeTrailsChange,
} from '@/data/trail-source';
import { RATING_COLORS, UNRATED_COLOR } from '@/data/trail-metadata';
import {
  STYLE_OWNED_ROUTE_LAYER_IDS,
  STYLE_OWNED_ROUTE_TILESET_IDS,
  STYLE_STRAY_LAYER_IDS,
} from '@/data/mapbox-style';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_LAYER_ID,
  OSM_TRAILS_CASING_LAYER_ID,
  OSM_TRAILS_HIT_LAYER_ID,
  OSM_POI_LAYER_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_POI_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
  MTB_SCALE_RATING,
  osmTrailDetails,
} from '@/data/osm-trails';
import {
  lookupPrecomputedElevation,
  buildOsmElevationProfile,
} from '@/utils/osm-elevation';
import {
  BIKE_NETWORK_BASE_CLASSES,
  BIKE_NETWORK_BASE_LAYER_ID,
  BIKE_NETWORK_CLASSES,
  BIKE_NETWORK_INFRA_CLASSES,
  BIKE_NETWORK_INFRA_LAYER_ID,
  BIKE_NETWORK_SOURCE_ID,
} from '@/data/bike-network';
import { MAP_EVENTS } from '@/events';

// --- Shared layer plumbing ----------------------------------------------------

// Rounded line-cap/join layout fragment shared by every line layer we add.
const ROUND_LINE = {
  'line-cap': 'round' as const,
  'line-join': 'round' as const,
};

// Curated MTB trail layers additionally tighten the round-join limit.
const ROUND_LINE_LIMIT = {
  ...ROUND_LINE,
  'line-round-limit': 0.1,
};

// Add a source only if the map doesn't already have it.
function ensureSource(
  map: mapboxgl.Map,
  id: string,
  spec: mapboxgl.SourceSpecification,
): void {
  if (!map.getSource(id)) {
    map.addSource(id, spec);
  }
}

// Add a layer only if the map doesn't already have it.
function addLayerOnce(
  map: mapboxgl.Map,
  spec: mapboxgl.LayerSpecification,
  beforeId?: string,
): void {
  if (!map.getLayer(spec.id)) {
    map.addLayer(spec, beforeId);
  }
}

// Flip visibility on each of the given layers that exists on the map.
function setLayersVisibility(
  map: mapboxgl.Map,
  ids: string[],
  visible: boolean,
): void {
  const value = visible ? 'visible' : 'none';
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', value);
    }
  }
}

// Show a pointer cursor while hovering over a layer's features.
export function registerPointerCursor(
  map: mapboxgl.Map,
  layerId: string,
): void {
  map.on('mouseenter', layerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
  });
}

// Flatten a feature's line geometry: a LineString yields one line, a
// MultiLineString yields each of its lines, anything else yields none.
function linesOfFeature(feature: GeoJSON.Feature): GeoJSON.Position[][] {
  const geom = feature.geometry;
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

export const BIKE_ROUTE_SOURCE_ID = 'bike-routes-source';
export const BIKE_ROUTE_LAYER_ID = 'bike-routes';
export const BIKE_ROUTE_CASING_LAYER_ID = 'bike-routes-casing';
export const LINE_HIT_TOLERANCE_PX = 12;

const styleRouteTilesetIds = new Set(STYLE_OWNED_ROUTE_TILESET_IDS);

function routePropertyExpression(
  routes: BikeRoute[],
  property: 'color' | 'defaultWidth',
): mapboxgl.Expression {
  const expression: unknown[] = ['match', ['get', 'id']];
  for (const route of routes) {
    expression.push(route.id, route[property]);
  }
  expression.push(property === 'color' ? '#2563EB' : 8);
  return expression as mapboxgl.Expression;
}

/** Remove Studio-owned route layers and their dedicated vector tilesets. */
export function removeStyleOwnedBikeRoutes(
  style: mapboxgl.StyleSpecification,
): mapboxgl.StyleSpecification {
  const routeLayerIds = new Set(STYLE_OWNED_ROUTE_LAYER_IDS);
  const composite = style.sources.composite;
  let nextComposite = composite;

  if (
    composite &&
    'url' in composite &&
    typeof composite.url === 'string' &&
    composite.url.startsWith('mapbox://')
  ) {
    const queryIndex = composite.url.indexOf('?');
    const sourceList = composite.url.slice(
      'mapbox://'.length,
      queryIndex === -1 ? undefined : queryIndex,
    );
    const query = queryIndex === -1 ? '' : composite.url.slice(queryIndex);
    const keptSources = sourceList
      .split(',')
      .filter((sourceId) => !styleRouteTilesetIds.has(sourceId));

    nextComposite = {
      ...composite,
      url: `mapbox://${keptSources.join(',')}${query}`,
    };
  }

  return {
    ...style,
    sources: {
      ...style.sources,
      ...(nextComposite ? { composite: nextComposite } : {}),
    },
    layers: style.layers.filter((layer) => !routeLayerIds.has(layer.id)),
  };
}

/** Fetch the optimized Studio style once so unused route tilesets can be pruned. */
export async function loadBikeRouteOptimizedStyle(
  styleUrl: string,
  accessToken: string,
  pruneStudioRoutes: boolean,
  signal?: AbortSignal,
): Promise<mapboxgl.StyleSpecification | string> {
  // A city without runtime route GeoJSON still needs its Studio-owned route
  // layers. In that case Mapbox can load the configured optimized style
  // directly, and the legacy layer setup in Map.tsx remains functional.
  if (!pruneStudioRoutes) return styleUrl;

  const match = /^mapbox:\/\/styles\/([^/]+)\/([^?]+)/.exec(styleUrl);
  if (!match) return styleUrl;

  const [, owner, styleId] = match;
  const apiUrl = new URL(
    `https://api.mapbox.com/styles/v1/${owner}/${styleId}`,
  );
  apiUrl.searchParams.set('optimize', 'true');
  apiUrl.searchParams.set('access_token', accessToken);

  try {
    const response = await fetch(apiUrl, { signal });
    if (!response.ok) {
      throw new Error(`Mapbox style request failed (${response.status})`);
    }
    const style = (await response.json()) as mapboxgl.StyleSpecification;
    return removeStyleOwnedBikeRoutes(style);
  } catch (error) {
    // Teardown deliberately aborts this request. Do not turn that into a
    // fallback style load (or a warning) in the effect that is going away.
    if (signal?.aborted) throw error;

    console.warn(
      'Could not prune Studio-owned route tilesets; using the configured style.',
      error,
    );
    return styleUrl;
  }
}

// Route utilities
export const ROUTE_DIRECTION_ARROW_IMAGE_ID = 'route-direction-arrow';

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

export function syncRouteArrowLayer(
  map: mapboxgl.Map,
  route: BikeRoute,
  layer: mapboxgl.AnyLayer,
  beforeId?: string,
): void {
  if (route.hideArrows || !('source' in layer)) return;

  const sourceId = layer.source;
  if (typeof sourceId !== 'string') return;

  const sourceLayer = layer['source-layer'];
  const layerFilter = 'filter' in layer ? layer.filter : undefined;
  const routeFilter: mapboxgl.FilterSpecification | undefined =
    layer.id === BIKE_ROUTE_LAYER_ID
      ? ['==', ['get', 'id'], route.id]
      : undefined;
  const filter: mapboxgl.FilterSpecification | undefined =
    layerFilter && routeFilter
      ? ['all', layerFilter, routeFilter]
      : (layerFilter ?? routeFilter);
  const features = map.querySourceFeatures(sourceId, {
    ...(sourceLayer ? { sourceLayer } : {}),
    ...(filter ? { filter } : {}),
  });
  const arrowData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: applyArrowDirectionOverrides(
      removeOverlappingSegments(features),
      route.reverseArrowBounds,
    ),
  };
  const arrowSourceId = `${route.id}-arrows-source`;
  const arrowLayerId = `${route.id}-arrows`;
  const arrowSource = map.getSource(arrowSourceId) as
    | mapboxgl.GeoJSONSource
    | undefined;

  if (arrowSource) {
    arrowSource.setData(arrowData);
  } else {
    map.addSource(arrowSourceId, { type: 'geojson', data: arrowData });
  }

  if (map.getLayer(arrowLayerId)) return;

  map.addLayer(
    {
      id: arrowLayerId,
      type: 'symbol',
      source: arrowSourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 160,
        'icon-image': ROUTE_DIRECTION_ARROW_IMAGE_ID,
        'icon-size': 1.2,
        'icon-rotate': route.reverseDirection ? 180 : 0,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-color': route.color,
        'icon-opacity': 0,
      },
    },
    beforeId,
  );
}

export function updateRouteOpacity(
  map: mapboxgl.Map,
  routes: BikeRoute[],
  selectedId: string | null,
  opacity: { selected: number; unselected: number },
) {
  const hasCombinedLayer = Boolean(map.getLayer(BIKE_ROUTE_LAYER_ID));

  if (hasCombinedLayer) {
    const width = routePropertyExpression(routes, 'defaultWidth');
    const isSelected: mapboxgl.Expression = [
      '==',
      ['get', 'id'],
      selectedId ?? '',
    ];
    const routeOpacity: number | mapboxgl.Expression = selectedId
      ? ['case', isSelected, opacity.selected, opacity.unselected]
      : opacity.unselected;

    map.setPaintProperty(BIKE_ROUTE_LAYER_ID, 'line-opacity', routeOpacity);

    if (map.getLayer(BIKE_ROUTE_CASING_LAYER_ID)) {
      const casingOpacity: number | mapboxgl.Expression = selectedId
        ? ['case', isSelected, opacity.selected * 0.8, opacity.unselected * 0.8]
        : opacity.unselected * 0.8;
      const casingWidth: mapboxgl.Expression = selectedId
        ? ['case', isSelected, ['+', width, 4], ['+', width, 2]]
        : ['+', width, 2];

      map.setPaintProperty(
        BIKE_ROUTE_CASING_LAYER_ID,
        'line-opacity',
        casingOpacity,
      );
      map.setPaintProperty(
        BIKE_ROUTE_CASING_LAYER_ID,
        'line-width',
        casingWidth,
      );
    }
  }

  routes.forEach((route) => {
    const isSelected = route.id === selectedId;
    if (!hasCombinedLayer) {
      try {
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
    }

    const arrowLayerId = `${route.id}-arrows`;
    if (map.getLayer(arrowLayerId)) {
      map.setPaintProperty(
        arrowLayerId,
        'icon-opacity',
        isSelected ? opacity.selected : 0,
      );
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

  if (!sourceId) {
    return null;
  }

  const filter = 'filter' in layer ? layer.filter : undefined;
  const features = map.querySourceFeatures(sourceId, {
    ...(sourceLayer ? { sourceLayer } : {}),
    ...(filter ? { filter } : {}),
  });

  if (features.length === 0) {
    return null;
  }

  // Calculate bounds of all features
  const bounds = new mapboxgl.LngLatBounds();

  features.forEach((feature: GeoJSON.Feature) => {
    for (const line of linesOfFeature(feature)) {
      for (const coord of line) {
        bounds.extend(coord as [number, number]);
      }
    }
  });

  // Only return bounds if we have valid coordinates
  return bounds.isEmpty() ? null : bounds;
}

// Remove line edges traversed by more than one path. Comparing edges instead of
// individual coordinates preserves arrows where routes merely cross or meet.
export function removeOverlappingSegments(
  features: GeoJSON.Feature[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  interface Path {
    coordinates: GeoJSON.Position[];
    ownerId: string;
  }

  const paths: Path[] = [];
  features.forEach((feature, featureIndex) => {
    const geom = feature.geometry;
    if (geom.type === 'LineString') {
      paths.push({
        coordinates: geom.coordinates,
        ownerId: pathOwnerId(feature, featureIndex, 0),
      });
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach((coordinates, partIndex) => {
        paths.push({
          coordinates,
          ownerId: pathOwnerId(feature, featureIndex, partIndex),
        });
      });
    }
  });

  if (paths.length === 0) return [];

  const cellSize = 0.00003; // ~3 meters; absorbs vector-tile quantization.
  const coordinateKey = (coordinate: GeoJSON.Position) =>
    `${Math.round(coordinate[0] / cellSize)},${Math.round(coordinate[1] / cellSize)}`;
  const edgeKey = (start: GeoJSON.Position, end: GeoJSON.Position): string => {
    const startKey = coordinateKey(start);
    const endKey = coordinateKey(end);
    return startKey < endKey
      ? `${startKey}|${endKey}`
      : `${endKey}|${startKey}`;
  };

  const edgeOwners = new Map<string, Set<string>>();
  for (const path of paths) {
    for (let i = 0; i < path.coordinates.length - 1; i++) {
      const key = edgeKey(path.coordinates[i], path.coordinates[i + 1]);
      const owners = edgeOwners.get(key) ?? new Set<string>();
      owners.add(path.ownerId);
      edgeOwners.set(key, owners);
    }
  }

  const result: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const path of paths) {
    let currentRun: GeoJSON.Position[] = [];

    for (let i = 0; i < path.coordinates.length - 1; i++) {
      const start = path.coordinates[i];
      const end = path.coordinates[i + 1];
      const owners = edgeOwners.get(edgeKey(start, end));

      if ((owners?.size ?? 0) > 1) {
        pushLineString(result, currentRun);
        currentRun = [];
        continue;
      }

      if (currentRun.length === 0) currentRun.push(start);
      currentRun.push(end);
    }

    pushLineString(result, currentRun);
  }

  return result;
}

export function applyArrowDirectionOverrides(
  features: GeoJSON.Feature<GeoJSON.LineString>[],
  reverseBounds: [number, number, number, number][] = [],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (reverseBounds.length === 0) return features;

  return features.flatMap((feature) => {
    const coordinates = feature.geometry.coordinates;
    if (coordinates.length < 2) return [];

    const result: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    let shouldReverse = edgeMatchesBounds(
      coordinates[0],
      coordinates[1],
      reverseBounds,
    );
    let currentRun = [coordinates[0], coordinates[1]];

    for (let i = 1; i < coordinates.length - 1; i++) {
      const edgeShouldReverse = edgeMatchesBounds(
        coordinates[i],
        coordinates[i + 1],
        reverseBounds,
      );

      if (edgeShouldReverse === shouldReverse) {
        currentRun.push(coordinates[i + 1]);
        continue;
      }

      pushDirectedLineString(result, currentRun, shouldReverse);
      currentRun = [coordinates[i], coordinates[i + 1]];
      shouldReverse = edgeShouldReverse;
    }

    pushDirectedLineString(result, currentRun, shouldReverse);
    return result;
  });
}

function edgeMatchesBounds(
  start: GeoJSON.Position,
  end: GeoJSON.Position,
  bounds: [number, number, number, number][],
): boolean {
  const midpointLng = (start[0] + end[0]) / 2;
  const midpointLat = (start[1] + end[1]) / 2;
  return bounds.some(
    ([swLng, swLat, neLng, neLat]) =>
      midpointLng >= swLng &&
      midpointLng <= neLng &&
      midpointLat >= swLat &&
      midpointLat <= neLat,
  );
}

function pushDirectedLineString(
  result: GeoJSON.Feature<GeoJSON.LineString>[],
  coordinates: GeoJSON.Position[],
  reverse: boolean,
): void {
  result.push({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: reverse ? [...coordinates].reverse() : coordinates,
    },
  });
}

function pathOwnerId(
  feature: GeoJSON.Feature,
  featureIndex: number,
  partIndex: number,
): string {
  const featureId = feature.id ?? `feature-${featureIndex}`;
  return `${String(featureId)}:${partIndex}`;
}

function pushLineString(
  result: GeoJSON.Feature<GeoJSON.LineString>[],
  coordinates: GeoJSON.Position[],
): void {
  if (coordinates.length < 2) return;
  result.push({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  });
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

/** Query visible line layers inside a touch-friendly screen-space box. */
export function queryNearbyLineFeatures(
  map: mapboxgl.Map,
  point: { x: number; y: number },
  layerIds: string[],
  tolerance = LINE_HIT_TOLERANCE_PX,
): mapboxgl.MapboxGeoJSONFeature[] {
  const activeLayers = layerIds.filter((id) => map.getLayer(id));
  if (activeLayers.length === 0) return [];

  const bounds: [[number, number], [number, number]] = [
    [point.x - tolerance, point.y - tolerance],
    [point.x + tolerance, point.y + tolerance],
  ];
  return map.queryRenderedFeatures(bounds, { layers: activeLayers });
}

// Mountain bike trail utilities
export function calculateTrailBounds(
  map: mapboxgl.Map,
  trailName: string,
): mapboxgl.LngLatBounds | null {
  for (const cfg of TRAIL_LAYERS) {
    const source = sourceIdForLayer(map, cfg);
    if (!source) continue;

    const features = map.querySourceFeatures(source, {
      ...(cfg.sourceLayer ? { sourceLayer: cfg.sourceLayer } : {}),
      filter: trailMatchExpr(cfg, trailName),
    });

    if (features.length === 0) continue;

    const bounds = new mapboxgl.LngLatBounds();
    for (const feature of features) {
      for (const line of linesOfFeature(feature)) {
        for (const coord of line) {
          bounds.extend(coord as [number, number]);
        }
      }
    }

    // Only return bounds if we have valid coordinates (calling getNorth() on
    // an empty LngLatBounds throws).
    if (!bounds.isEmpty()) {
      return bounds;
    }
  }

  return null;
}

/** Convert a [swLng, swLat, neLng, neLat] tuple to LngLatBounds, or return undefined. */
export function toLngLatBounds(
  defaultBounds: [number, number, number, number] | undefined,
): mapboxgl.LngLatBounds | undefined {
  if (!defaultBounds) return undefined;
  const [swLng, swLat, neLng, neLat] = defaultBounds;
  return new mapboxgl.LngLatBounds([swLng, swLat], [neLng, neLat]);
}

// Anything carrying runtime bounds plus a static [swLng, swLat, neLng, neLat]
// fallback (both BikeRoute and MountainBikeTrail qualify).
interface BoundedItem {
  bounds?: mapboxgl.LngLatBounds;
  defaultBounds?: [number, number, number, number];
}

function initBoundsFromDefaults(items: BoundedItem[]): void {
  for (const item of items) {
    if (!item.bounds && item.defaultBounds) {
      item.bounds = toLngLatBounds(item.defaultBounds);
    }
  }
}

export function initTrailBoundsFromDefaults(trails: MountainBikeTrail[]): void {
  initBoundsFromDefaults(trails);
}

export function initRouteBoundsFromDefaults(routes: BikeRoute[]): void {
  initBoundsFromDefaults(routes);
}

export function getAreaBounds(
  trails: MountainBikeTrail[],
  areaName: string,
): mapboxgl.LngLatBounds | null {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoords = false;
  for (const trail of trails) {
    if (trail.recArea !== areaName && regionOf(trail) !== areaName) continue;
    const trailBounds = trail.bounds ?? toLngLatBounds(trail.defaultBounds);
    if (trailBounds) {
      bounds.extend(trailBounds);
      hasCoords = true;
    }
  }
  return hasCoords ? bounds : null;
}

// Trail layer configuration — each entry represents a Mapbox layer
// containing mountain bike trails with its own property names
interface TrailLayerConfig {
  layerId: string;
  sourceLayer?: string;
  trailProp: string; // feature property containing the trail name
  sourceId?: string;
  tilesetUrl?: string;
  geojsonUrl?: string;
  geojsonFallbackUrl?: string;
  matchBy?: 'name' | 'osmId';
  // Maps the raw feature-property value (e.g. tileset 'Trail' name) to the
  // line color. Falls back to UNRATED_COLOR for anything unlisted.
  colorMap: Record<string, string>;
  // Maps the user-facing displayName to the raw feature value used for
  // selection/highlight match expressions. Identity for layers whose tileset
  // trail names already match our displayNames.
  toRawName: (displayName: string) => string;
}

// These two lookups are derived from the trail list, which now arrives from the
// database at render time rather than being fixed at import time. Building them
// lazily (and dropping them when the list changes) keeps the derivation in one
// place instead of forcing every caller to thread trails through.
let trailByNameCache: Map<string, MountainBikeTrail> | null = null;
let osmIdOwnerCache: Map<string, MountainBikeTrail> | null = null;

onMountainBikeTrailsChange(() => {
  trailByNameCache = null;
  osmIdOwnerCache = null;
});

// Look up a curated trail by its trailName (used to resolve osmIds for layers
// that match by OSM_ID rather than by name).
function trailByName(): Map<string, MountainBikeTrail> {
  if (!trailByNameCache) {
    trailByNameCache = new Map(
      getMountainBikeTrails().map((t) => [t.trailName, t]),
    );
  }
  return trailByNameCache;
}

// A single OSM way can be shared by several curated trails (named trails that
// physically overlap on one way). Pick ONE deterministic owner per way id so
// that the rendered color and a click's resolved trail always agree — never a
// silent array-order tiebreak. Owner = most specific (fewest ways), then
// shortest, then name, so a short trail that *is* the way wins over a long
// trail merely passing through it.
function osmIdOwner(): Map<string, MountainBikeTrail> {
  if (osmIdOwnerCache) {
    return osmIdOwnerCache;
  }

  const owner = new Map<string, MountainBikeTrail>();
  const moreSpecific = (
    a: MountainBikeTrail,
    b: MountainBikeTrail,
  ): boolean => {
    const an = a.osmIds?.length ?? 0;
    const bn = b.osmIds?.length ?? 0;
    if (an !== bn) return an < bn;
    const ad = a.distance ?? Number.POSITIVE_INFINITY;
    const bd = b.distance ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad < bd;
    return a.trailName < b.trailName;
  };
  for (const trail of getMountainBikeTrails()) {
    for (const id of trail.osmIds ?? []) {
      const key = String(id);
      const cur = owner.get(key);
      if (!cur || moreSpecific(trail, cur)) owner.set(key, trail);
    }
  }

  osmIdOwnerCache = owner;
  return owner;
}

// The key expression a layer's color/match expressions read. OSM_ID is numeric
// in the tiles; coerce to string so literal id lists compare reliably.
function matchKeyExpr(cfg: TrailLayerConfig): mapboxgl.Expression {
  return cfg.matchBy === 'osmId'
    ? ['to-string', ['get', 'OSM_ID']]
    : ['get', cfg.trailProp];
}

// Boolean "does this feature belong to the selected trail?" expression.
function trailMatchExpr(
  cfg: TrailLayerConfig,
  trailName: string,
): mapboxgl.Expression {
  if (cfg.matchBy === 'osmId') {
    const ids = (trailByName().get(trailName)?.osmIds ?? []).map(String);
    return ['in', ['to-string', ['get', 'OSM_ID']], ['literal', ids]];
  }
  return ['==', ['get', cfg.trailProp], cfg.toRawName(trailName)];
}

// Reverse lookup for osmId-matched layers: which curated trail owns this way?
// Uses the same deterministic owner as the color expression so a clicked
// segment's name and its color can never disagree.
export function trailNameForOsmId(osmId: string | number): string | null {
  return osmIdOwner().get(String(osmId))?.trailName ?? null;
}

// Boolean "does this feature belong to any of these trails?" expression.
function areaMatchExpr(
  cfg: TrailLayerConfig,
  trails: MountainBikeTrail[],
): mapboxgl.Expression {
  if (cfg.matchBy === 'osmId') {
    const ids = trails.flatMap((t) => t.osmIds ?? []).map(String);
    return ['in', ['to-string', ['get', 'OSM_ID']], ['literal', ids]];
  }
  const rawNames = trails.map((t) => cfg.toRawName(t.trailName));
  return ['in', ['get', cfg.trailProp], ['literal', rawNames]];
}

function buildColorExpression(
  key: mapboxgl.Expression,
  colorMap: Record<string, string>,
): mapboxgl.Expression {
  const entries: (string | mapboxgl.Expression)[] = ['match', key];
  for (const [name, color] of Object.entries(colorMap)) {
    entries.push(name);
    entries.push(color);
  }
  entries.push(UNRATED_COLOR);
  return entries as mapboxgl.Expression;
}

function buildTrailLayerConfig(): TrailLayerConfig[] {
  return mountainBikeConfig.layers.map((layer) => {
    const metadata = layer.metadata ?? {};
    const hasMetadata = Object.keys(metadata).length > 0;
    let colorMap: Record<string, string>;
    if (layer.matchBy === 'osmId') {
      // Color keyed by OSM_ID, using the deterministic per-way owner so a
      // shared way is colored as the same trail a click would select.
      colorMap = {};
      for (const [id, trail] of osmIdOwner()) colorMap[id] = trail.color;
    } else if (hasMetadata) {
      colorMap = Object.fromEntries(
        Object.entries(metadata).map(([rawName, meta]) => [
          rawName,
          RATING_COLORS[meta.rating] ?? UNRATED_COLOR,
        ]),
      );
    } else {
      colorMap = Object.fromEntries(
        getMountainBikeTrails().map((trail) => [trail.trailName, trail.color]),
      );
    }
    const displayToRaw = Object.fromEntries(
      Object.entries(metadata).map(([rawName, meta]) => [
        meta.displayName,
        rawName,
      ]),
    );

    return {
      ...layer,
      colorMap,
      toRawName: (name: string) => displayToRaw[name] ?? name,
    };
  });
}

const TRAIL_LAYERS: TrailLayerConfig[] = buildTrailLayerConfig();

function casingId(layerId: string): string {
  return `${layerId} Casing`;
}
function glowId(layerId: string): string {
  return `${layerId} Glow`;
}

export { TRAIL_LAYERS };

function sourceIdForLayer(
  map: mapboxgl.Map,
  cfg: TrailLayerConfig,
): string | null {
  const layer = map.getLayer(cfg.layerId) as
    | (mapboxgl.LayerSpecification & { source?: string })
    | undefined;
  return layer?.source ?? cfg.sourceId ?? null;
}

// Attach any city-managed curated trail vector/GeoJSON sources that are not
// already baked into the Mapbox Studio style. Idempotent: skips existing ones.
export function ensureMtnBikeSource(map: mapboxgl.Map): void {
  try {
    for (const cfg of TRAIL_LAYERS) {
      if (!cfg.sourceId || (!cfg.tilesetUrl && !cfg.geojsonUrl)) continue;

      if (!map.getSource(cfg.sourceId)) {
        const { geojsonFallbackUrl, geojsonUrl, sourceId } = cfg;
        if (geojsonUrl && geojsonFallbackUrl) {
          // Fetched here rather than handed to Mapbox, which has no answer to
          // the URL failing. The source must exist before the layer below reads
          // it, so it starts empty and is filled in when the fetch settles —
          // deliberately not awaited, as the layers have to be added in this
          // same synchronous style-load pass.
          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          void loadCuratedGeojson(
            map,
            sourceId,
            geojsonUrl,
            geojsonFallbackUrl,
          );
        } else {
          map.addSource(
            sourceId,
            geojsonUrl
              ? { type: 'geojson', data: geojsonUrl }
              : { type: 'vector', url: cfg.tilesetUrl as string },
          );
        }
      }
      addLayerOnce(map, {
        id: cfg.layerId,
        type: 'line',
        source: cfg.sourceId,
        ...(cfg.sourceLayer ? { 'source-layer': cfg.sourceLayer } : {}),
        layout: ROUND_LINE_LIMIT,
        paint: {
          'line-color': UNRATED_COLOR,
          'line-width': 3,
          'line-opacity': 0.5,
        },
      });
    }
  } catch (error) {
    console.error('Failed to attach MTB trail source/layer:', error);
  }
}

/**
 * Fills a curated trail source from its API, falling back to the static file
 * the database was seeded from.
 *
 * The API is database-backed: with no `DATABASE_URL` or a database that is down
 * it answers 503, and one that has never been seeded answers with an empty
 * FeatureCollection. Both draw zero lines while the sidebar still lists every
 * trail from the checked-in data, so clicking one zooms to blank basemap. An
 * empty answer is therefore treated as a miss here — for a city configured with
 * a fallback, "no trails" is not a state the map is meant to be able to reach.
 */
export async function loadCuratedGeojson(
  map: mapboxgl.Map,
  sourceId: string,
  url: string,
  fallbackUrl: string,
): Promise<void> {
  const primary = await fetchFeatureCollection(url);
  const data = primary?.features.length
    ? primary
    : ((await fetchFeatureCollection(fallbackUrl)) ?? primary);

  if (!data) {
    console.error(
      `No curated trail GeoJSON from ${url} or its fallback ${fallbackUrl}.`,
    );
    return;
  }

  const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
  // The style can be swapped out from under an in-flight fetch, which takes the
  // source with it.
  if (source?.setData) {
    source.setData(data);
  }
}

async function fetchFeatureCollection(
  url: string,
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Trail GeoJSON at ${url} returned ${response.status}.`);
      return null;
    }
    const data = (await response.json()) as GeoJSON.FeatureCollection;
    return Array.isArray(data?.features) ? data : null;
  } catch (error) {
    console.error(`Failed to load trail GeoJSON from ${url}:`, error);
    return null;
  }
}

// --- Nationwide OSM bike trails (OpenStreetMap US tile service) ---------------

// Bike-relevant trails. A way qualifies when bikes are explicitly permitted
// (`bicycle` in yes/designated/permissive — this wins even over a general
// access restriction), OR it carries an `mtb:scale` tag (MTB singletrack often
// lacks an explicit bicycle tag) or is a cycleway AND is not bike-denied
// (`bicycle=no/private`) or access-restricted (`access=no/private`). This keeps
// foot-only / horse-only and explicitly off-limits paths out of the layer.
export const OSM_BIKE_TRAIL_FILTER: mapboxgl.FilterSpecification = [
  'any',
  ['in', ['get', 'bicycle'], ['literal', ['yes', 'designated', 'permissive']]],
  [
    'all',
    ['any', ['has', 'mtb:scale'], ['==', ['get', 'highway'], 'cycleway']],
    ['!', ['in', ['get', 'bicycle'], ['literal', ['no', 'private']]]],
    ['!', ['in', ['get', 'access'], ['literal', ['no', 'private']]]],
  ],
];

// Trail POIs we surface: trailhead parking (amenity=parking) and information
// points (tourism=information). Everything else in trail_poi is hidden.
export const OSM_POI_FILTER: mapboxgl.FilterSpecification = [
  'any',
  ['==', ['get', 'amenity'], 'parking'],
  ['==', ['get', 'tourism'], 'information'],
];

// Lines render only from this zoom in — nationwide trail geometry at lower
// zooms is dense and janky; the POI symbols gate higher still (z12).
const OSM_TRAILS_MIN_ZOOM = 9;

// Pick a Maki sprite icon per POI category (icons ship with the Mapbox style).
const OSM_POI_ICON_EXPRESSION: mapboxgl.Expression = [
  'case',
  ['==', ['get', 'amenity'], 'parking'],
  'parking',
  'information',
];

// Color by MTB difficulty, derived from the shared MTB_SCALE_RATING map so the
// line color and the popup difficulty badge can never disagree (incl. the +/-
// scale refinements). Tokens are grouped by color to keep the match compact;
// trails without an mtb:scale tag fall back to the neutral unrated color.
function buildOsmTrailColorExpression(): mapboxgl.Expression {
  const tokensByColor = new Map<string, string[]>();
  for (const [token, rating] of Object.entries(MTB_SCALE_RATING)) {
    const color = RATING_COLORS[rating] ?? UNRATED_COLOR;
    const tokens = tokensByColor.get(color) ?? [];
    tokens.push(token);
    tokensByColor.set(color, tokens);
  }
  const expr: unknown[] = ['match', ['get', 'mtb:scale']];
  for (const [color, tokens] of tokensByColor) {
    expr.push(tokens, color);
  }
  expr.push(UNRATED_COLOR);
  return expr as mapboxgl.Expression;
}

const OSM_TRAIL_COLOR_EXPRESSION = buildOsmTrailColorExpression();

// Attach the OSM trails tileset and its filtered line layers (white casing, the
// colored line, and a transparent wide tap target). Hidden by default — toggled
// from the "Map Layers" sidebar. Idempotent: skips existing source/layers.
// Inserted beneath the curated MTB layer (via beforeId) so curated content
// stays on top and curated clicks win over OSM clicks.
export function ensureOsmTrailsSource(map: mapboxgl.Map): void {
  try {
    ensureSource(map, OSM_TRAILS_SOURCE_ID, {
      type: 'vector',
      url: OSM_TRAILS_TILEJSON_URL,
    });

    const firstCuratedLayer = TRAIL_LAYERS.find((cfg) =>
      map.getLayer(cfg.layerId),
    );
    const beforeId = firstCuratedLayer?.layerId;

    // Exclude source ways represented by curated trails so they aren't stroked
    // twice and curated clicks win over the nationwide hit layer.
    const curatedIds = getMountainBikeTrails()
      .flatMap((t) => t.osmIds ?? [])
      .map(String);
    const baseFilter: mapboxgl.FilterSpecification =
      curatedIds.length > 0
        ? [
            'all',
            OSM_BIKE_TRAIL_FILTER,
            [
              '!',
              ['in', ['to-string', ['get', 'OSM_ID']], ['literal', curatedIds]],
            ],
          ]
        : OSM_BIKE_TRAIL_FILTER;

    const baseLine = {
      type: 'line' as const,
      source: OSM_TRAILS_SOURCE_ID,
      'source-layer': OSM_TRAILS_SOURCE_LAYER,
      minzoom: OSM_TRAILS_MIN_ZOOM,
      filter: baseFilter,
      layout: { ...ROUND_LINE, visibility: 'none' as const },
    };

    const lineLayers = [
      {
        id: OSM_TRAILS_CASING_LAYER_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5],
          'line-opacity': 0.6,
        },
      },
      {
        id: OSM_TRAILS_LAYER_ID,
        paint: {
          'line-color': OSM_TRAIL_COLOR_EXPRESSION,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.5],
          'line-opacity': 0.75,
        },
      },
      {
        id: OSM_TRAILS_HIT_LAYER_ID,
        paint: {
          'line-color': 'rgba(0,0,0,0)',
          'line-width': 14,
          'line-opacity': 0,
        },
      },
    ];

    for (const { id, paint } of lineLayers) {
      if (map.getLayer(id)) continue;
      map.addLayer(
        { ...baseLine, id, paint } as mapboxgl.LayerSpecification,
        beforeId,
      );
    }

    // Trailhead parking + information points (Maki icons), only once zoomed in
    // so the nationwide view isn't cluttered. Symbol collision thins them out.
    if (!map.getLayer(OSM_POI_LAYER_ID)) {
      map.addLayer({
        id: OSM_POI_LAYER_ID,
        type: 'symbol',
        source: OSM_TRAILS_SOURCE_ID,
        'source-layer': OSM_POI_SOURCE_LAYER,
        minzoom: 12,
        filter: OSM_POI_FILTER,
        layout: {
          visibility: 'none',
          'icon-image': OSM_POI_ICON_EXPRESSION,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 1.1],
          'icon-allow-overlap': false,
          'text-optional': true,
          'text-field': ['coalesce', ['get', 'name'], ''],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: {
          'text-color': '#374151',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });
    }
  } catch (error) {
    console.error('Failed to attach OSM trails source/layer:', error);
  }
}

export function setOsmTrailsVisible(map: mapboxgl.Map, visible: boolean): void {
  setLayersVisibility(
    map,
    [
      OSM_TRAILS_CASING_LAYER_ID,
      OSM_TRAILS_LAYER_ID,
      OSM_TRAILS_HIT_LAYER_ID,
      OSM_POI_LAYER_ID,
    ],
    visible,
  );
}

// Anchor runtime overlays just beneath the first label so place/road names stay
// legible. Undefined when the style has no symbol layers — then there are no
// labels to obscure, so addLayer's default (append on top) is fine.
function firstSymbolLayerId(map: mapboxgl.Map): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
}

// --- Classified bike network (Casual overlay) --------------------------------

// Built once: color by `class` via the shared match-expression builder.
const BIKE_NETWORK_COLOR = buildColorExpression(
  ['get', 'class'],
  Object.fromEntries(BIKE_NETWORK_CLASSES.map((c) => [c.key, c.color])),
);

// Two stacked sub-layers: a thin base tint (calm/caution streets) under a
// thicker infra layer (trails + bike lanes).
const BIKE_NETWORK_LAYERS: {
  id: string;
  classes: string[];
  width: mapboxgl.Expression;
  opacity: number;
}[] = [
  {
    id: BIKE_NETWORK_BASE_LAYER_ID,
    classes: BIKE_NETWORK_BASE_CLASSES,
    width: ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 2.5],
    opacity: 0.65,
  },
  {
    id: BIKE_NETWORK_INFRA_LAYER_ID,
    classes: BIKE_NETWORK_INFRA_CLASSES,
    width: ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 4],
    opacity: 0.9,
  },
];

// Attach the city's classified bike-network GeoJSON as the two stacked layers
// above. Hidden until toggled. Idempotent.
export function ensureBikeNetworkSource(map: mapboxgl.Map, url: string): void {
  try {
    ensureSource(map, BIKE_NETWORK_SOURCE_ID, { type: 'geojson', data: url });
    const beforeId = firstSymbolLayerId(map);
    for (const l of BIKE_NETWORK_LAYERS) {
      addLayerOnce(
        map,
        {
          id: l.id,
          type: 'line',
          source: BIKE_NETWORK_SOURCE_ID,
          filter: ['in', ['get', 'class'], ['literal', l.classes]],
          layout: { ...ROUND_LINE, visibility: 'none' },
          paint: {
            'line-color': BIKE_NETWORK_COLOR,
            'line-width': l.width,
            'line-opacity': l.opacity,
          },
        } as mapboxgl.LayerSpecification,
        beforeId,
      );
    }
  } catch (error) {
    console.error('Failed to attach bike network:', error);
  }
}

export function setBikeNetworkVisible(
  map: mapboxgl.Map,
  visible: boolean,
): void {
  setLayersVisibility(
    map,
    BIKE_NETWORK_LAYERS.map((l) => l.id),
    visible,
  );
}

// --- Inline (GeoJSON-backed) bike routes -------------------------------------

// Attach every curated route from one static GeoJSON source. Color, width, and
// selection state are data-driven so the renderer only evaluates one casing
// and one route layer regardless of how many routes a city has. Idempotent.
export function ensureInlineRoutes(
  map: mapboxgl.Map,
  url: string,
  routes: BikeRoute[],
): void {
  try {
    ensureSource(map, BIKE_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: url,
      maxzoom: 14,
      tolerance: 0.5,
      promoteId: 'id',
    });
    const beforeId = firstSymbolLayerId(map);
    const color = routePropertyExpression(routes, 'color');
    const width = routePropertyExpression(routes, 'defaultWidth');

    addLayerOnce(
      map,
      {
        id: BIKE_ROUTE_CASING_LAYER_ID,
        type: 'line',
        source: BIKE_ROUTE_SOURCE_ID,
        layout: ROUND_LINE,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['+', width, 2],
          'line-opacity': 0.3,
        },
      },
      beforeId,
    );
    addLayerOnce(
      map,
      {
        id: BIKE_ROUTE_LAYER_ID,
        type: 'line',
        source: BIKE_ROUTE_SOURCE_ID,
        layout: ROUND_LINE,
        paint: {
          'line-color': color,
          'line-width': width,
          'line-opacity': 0.2,
        },
      },
      beforeId,
    );
  } catch (error) {
    console.error('Failed to attach inline routes:', error);
  }
}

// --- Selected OSM trail highlight --------------------------------------------
const OSM_HL_SOURCE_ID = 'osm-trail-highlight';
const OSM_HL_CASING_ID = 'osm-trail-highlight-casing';
const OSM_HL_LINE_ID = 'osm-trail-highlight-line';

export function clearOsmTrailHighlight(map: mapboxgl.Map): void {
  for (const id of [OSM_HL_LINE_ID, OSM_HL_CASING_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(OSM_HL_SOURCE_ID)) map.removeSource(OSM_HL_SOURCE_ID);
}

// Draw a bright highlight over the selected OSM way (white casing + blue line),
// the way curated routes are emphasised when selected.
export function highlightOsmTrail(
  map: mapboxgl.Map,
  lines: [number, number][][],
): void {
  clearOsmTrailHighlight(map);
  if (lines.length === 0) return;

  map.addSource(OSM_HL_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: lines },
    },
  });
  map.addLayer({
    id: OSM_HL_CASING_ID,
    type: 'line',
    source: OSM_HL_SOURCE_ID,
    layout: ROUND_LINE,
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: OSM_HL_LINE_ID,
    type: 'line',
    source: OSM_HL_SOURCE_ID,
    layout: ROUND_LINE,
    paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 1 },
  });
}

// Gather all loaded line geometry for an OSM way, keyed by its OSM id so a way
// split across vector tiles is reassembled. Falls back to the clicked feature's
// own geometry when there's no id or nothing else is loaded.
function collectOsmWayLines(
  map: mapboxgl.Map,
  osmId: unknown,
  clicked: mapboxgl.GeoJSONFeature,
): [number, number][][] {
  let features: GeoJSON.Feature[] = [];
  if (osmId != null) {
    features = map.querySourceFeatures(OSM_TRAILS_SOURCE_ID, {
      sourceLayer: OSM_TRAILS_SOURCE_LAYER,
      filter: ['==', ['get', 'OSM_ID'], osmId as string | number],
    });
  }
  if (features.length === 0) features = [clicked];

  const lines: [number, number][][] = [];
  for (const feature of features) {
    for (const line of linesOfFeature(feature)) {
      lines.push(line as [number, number][]);
    }
  }
  return lines;
}

// Make OSM trails clickable: a click on the (transparent, wide) hit layer opens
// a popup with the trail's name + OSM tags. Mapbox only fires layer events for
// visible layers, so these no-op while the layer is toggled off. Registered
// once after the layer is attached.
export function registerOsmTrailSelection(map: mapboxgl.Map): () => void {
  // Bumped on every new selection or clear; pending async work checks it so a
  // stale terrain sample can't show the wrong trail's pane.
  let selectionId = 0;
  // True only while we dispatch our own deselect events (to clear a curated
  // selection) so the foreign-select listener below doesn't tear us down too.
  let selecting = false;
  // Whether an OSM trail is currently selected (highlight + pane showing). Lets
  // us clear on layer-hide without disturbing a curated selection.
  let hasSelection = false;

  const clearSelection = () => {
    selectionId++;
    hasSelection = false;
    clearOsmTrailHighlight(map);
  };

  // Selecting a curated route/trail, or any deselect (e.g. an empty-map click),
  // clears the OSM highlight. The elevation pane clears via its own listeners on
  // these same events.
  const onForeignSelect = () => {
    if (!selecting) clearSelection();
  };
  const foreignEvents = [
    MAP_EVENTS.ROUTE_SELECT,
    MAP_EVENTS.TRAIL_SELECT,
    MAP_EVENTS.ROUTE_DESELECT,
    MAP_EVENTS.TRAIL_DESELECT,
  ];
  for (const ev of foreignEvents) window.addEventListener(ev, onForeignSelect);

  // Hiding the Nationwide trails layer must also drop any active OSM selection,
  // or the highlight + elevation pane linger while the layer reads "off". Guard
  // on hasSelection so a curated selection (which also registers in the pane as
  // a 'trail') is left untouched.
  const onLayerToggle = (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {};
    if (detail.layer !== 'osmTrails' || detail.visible || !hasSelection) return;
    clearSelection();
    selecting = true;
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
    selecting = false;
  };
  window.addEventListener(MAP_EVENTS.LAYER_TOGGLE, onLayerToggle);

  map.on('click', OSM_TRAILS_HIT_LAYER_ID, (e) => {
    // A curated trail/route sitting on top already handled this click.
    if (e.defaultPrevented) return;
    const feature = e.features?.[0];
    if (!feature) return;
    // Stop the empty-map click handler from also deselecting routes/trails.
    e.preventDefault();

    const props = feature.properties ?? {};
    // Reconstruct the full way across tile boundaries by OSM id so length and
    // elevation aren't truncated at the clicked tile's edge.
    const lines = collectOsmWayLines(map, props.OSM_ID, feature);
    const name =
      typeof props.name === 'string' && props.name.trim()
        ? props.name.trim()
        : 'Unnamed trail';
    const token = mapboxgl.accessToken ?? '';

    // Replace any prior OSM selection, then clear any curated route/trail
    // selection (guarded so our own deselects don't tear down this selection).
    clearSelection();
    const mySelection = selectionId;
    selecting = true;
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
    selecting = false;

    // Highlight the whole way like a selected route.
    highlightOsmTrail(map, lines);
    hasSelection = true;

    // Build the elevation pane's profile. The per-point chart always comes from
    // real-time terrain sampling (precompute stores no points); precomputed
    // stats, when available, drive the headline totals — supporting both paths.
    lookupPrecomputedElevation(props.OSM_ID, e.lngLat.lng, e.lngLat.lat)
      .catch(() => null)
      .then((precomputed) =>
        buildOsmElevationProfile(lines, name, token, precomputed),
      )
      .then((profile) => {
        if (selectionId !== mySelection || !profile) return; // superseded
        // Carry a tiny OSM tag summary for the pane header.
        profile.osm = osmTrailDetails(props);
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.OSM_TRAIL_SELECT, { detail: { profile } }),
        );
      })
      .catch(() => {});
  });

  registerPointerCursor(map, OSM_TRAILS_HIT_LAYER_ID);

  // map.remove() tears down the map.on(...) handlers above, but these window
  // listeners outlive it. Return a cleanup so a remount doesn't leak or
  // duplicate them (and fire clearOsmTrailHighlight on an already-removed map).
  return () => {
    for (const ev of foreignEvents) {
      window.removeEventListener(ev, onForeignSelect);
    }
    window.removeEventListener(MAP_EVENTS.LAYER_TOGGLE, onLayerToggle);
  };
}

export function hideStyleLayers(map: mapboxgl.Map, layerIds: string[]): void {
  for (const id of layerIds) {
    try {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    } catch {
      // Layer may not exist in this style
    }
  }
}

// Hide orphan trail layers baked into the Studio style that the app doesn't
// manage. Idempotent and guarded — skips any that aren't present.
export function hideStrayStyleLayers(map: mapboxgl.Map): void {
  hideStyleLayers(map, STYLE_STRAY_LAYER_IDS);
}

export function initMtnBikeColors(map: mapboxgl.Map): void {
  for (const cfg of TRAIL_LAYERS) {
    try {
      if (map.getLayer(cfg.layerId)) {
        map.setPaintProperty(
          cfg.layerId,
          'line-color',
          buildColorExpression(matchKeyExpr(cfg), cfg.colorMap),
        );
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

    // Insertion order matters: casing slides under the base layer and the
    // selection-only glow sits beneath the casing.
    const sublayers: {
      id: string;
      paint: mapboxgl.LineLayerSpecification['paint'];
      beforeId?: string;
    }[] = [
      {
        id: cId,
        paint: {
          'line-color': '#ffffff',
          'line-width': 5,
          'line-opacity': 0.5,
        },
        beforeId: cfg.layerId,
      },
      {
        id: gId,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0,
          'line-opacity': 0,
          'line-blur': 10,
        },
        beforeId: cId,
      },
    ];
    for (const s of sublayers) {
      addLayerOnce(
        map,
        {
          id: s.id,
          type: 'line',
          source,
          ...(cfg.sourceLayer ? { 'source-layer': cfg.sourceLayer } : {}),
          layout:
            s.id === gId
              ? { ...ROUND_LINE_LIMIT, visibility: 'none' }
              : ROUND_LINE_LIMIT,
          paint: s.paint,
        },
        s.beforeId,
      );
    }

    map.setLayoutProperty(
      cfg.layerId,
      'line-cap',
      ROUND_LINE_LIMIT['line-cap'],
    );
    map.setLayoutProperty(
      cfg.layerId,
      'line-join',
      ROUND_LINE_LIMIT['line-join'],
    );
    map.setLayoutProperty(
      cfg.layerId,
      'line-round-limit',
      ROUND_LINE_LIMIT['line-round-limit'],
    );

    // Restrict every source to the curated list. A source snapshot can contain
    // unnamed, retired, or non-MTB lines alongside the trails represented in
    // the sidebar; drawing those would create unselectable gray features. OSM
    // layers match by way id, while imported GIS layers match by raw name.
    let filter: mapboxgl.FilterSpecification;
    if (cfg.matchBy === 'osmId') {
      const curatedIds = getMountainBikeTrails()
        .flatMap((t) => t.osmIds ?? [])
        .map(String);
      filter = [
        'in',
        ['to-string', ['get', 'OSM_ID']],
        ['literal', curatedIds],
      ];
    } else {
      const curatedNames = getMountainBikeTrails().map((trail) =>
        cfg.toRawName(trail.trailName),
      );
      const curatedFilter: mapboxgl.FilterSpecification = [
        'in',
        ['get', cfg.trailProp],
        ['literal', curatedNames],
      ];
      filter =
        mountainBikeConfig.hiddenTrails.length > 0
          ? [
              'all',
              curatedFilter,
              [
                '!',
                [
                  'in',
                  ['get', cfg.trailProp],
                  ['literal', mountainBikeConfig.hiddenTrails],
                ],
              ],
            ]
          : curatedFilter;
    }
    for (const id of [cfg.layerId, ...sublayers.map((s) => s.id)]) {
      if (map.getLayer(id)) {
        map.setFilter(id, filter);
      }
    }
  }
}

function setTrailOpacity(
  map: mapboxgl.Map,
  cfg: TrailLayerConfig,
  selectedTrailName: string | null,
): void {
  const cId = casingId(cfg.layerId);
  const gId = glowId(cfg.layerId);

  if (selectedTrailName) {
    const sel = trailMatchExpr(cfg, selectedTrailName);
    map.setPaintProperty(cfg.layerId, 'line-opacity', ['case', sel, 0.9, 0.5]);
    map.setPaintProperty(cfg.layerId, 'line-width', ['case', sel, 4, 3]);

    if (map.getLayer(cId)) {
      map.setPaintProperty(cId, 'line-opacity', ['case', sel, 0.9, 0.5]);
      map.setPaintProperty(cId, 'line-width', ['case', sel, 6, 5]);
    }

    if (map.getLayer(gId)) {
      map.setLayoutProperty(gId, 'visibility', 'visible');
      map.setPaintProperty(gId, 'line-opacity', ['case', sel, 0.7, 0]);
      map.setPaintProperty(gId, 'line-width', ['case', sel, 24, 0]);
    }
  } else {
    map.setPaintProperty(cfg.layerId, 'line-opacity', 0.5);
    map.setPaintProperty(cfg.layerId, 'line-width', 3);

    if (map.getLayer(cId)) {
      map.setPaintProperty(cId, 'line-opacity', 0.5);
      map.setPaintProperty(cId, 'line-width', 5);
    }

    if (map.getLayer(gId)) {
      map.setPaintProperty(gId, 'line-opacity', 0);
      map.setPaintProperty(gId, 'line-width', 0);
      map.setLayoutProperty(gId, 'visibility', 'none');
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
    (t) => t.recArea === areaName || regionOf(t) === areaName,
  );
  if (matchedTrails.length === 0) return;

  for (const cfg of TRAIL_LAYERS) {
    if (!map.getLayer(cfg.layerId)) continue;

    // Boolean: is this feature one of the area's trails?
    const inArea = areaMatchExpr(cfg, matchedTrails);

    const cId = casingId(cfg.layerId);
    const gId = glowId(cfg.layerId);

    try {
      map.setPaintProperty(cfg.layerId, 'line-opacity', [
        'case',
        inArea,
        0.9,
        0.4,
      ]);
      map.setPaintProperty(cfg.layerId, 'line-width', ['case', inArea, 3, 3]);

      if (map.getLayer(cId)) {
        map.setPaintProperty(cId, 'line-opacity', ['case', inArea, 0.6, 0.4]);
        map.setPaintProperty(cId, 'line-width', ['case', inArea, 5, 5]);
      }

      if (map.getLayer(gId)) {
        map.setPaintProperty(gId, 'line-opacity', 0);
        map.setPaintProperty(gId, 'line-width', 0);
        map.setLayoutProperty(gId, 'visibility', 'none');
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
  segments: [number, number][][],
): void {
  removeRideLayer(map);

  map.addSource(RIDE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: segments.filter((segment) => segment.length >= 2),
      },
    },
  });

  map.addLayer({
    id: RIDE_LINE_ID,
    type: 'line',
    source: RIDE_SOURCE_ID,
    layout: ROUND_LINE,
    paint: {
      'line-color': RIDE_LINE_COLOR,
      'line-width': 4,
      'line-opacity': 0.85,
    },
  });
}

export function updateRideLayer(
  map: mapboxgl.Map,
  segments: [number, number][][],
): void {
  const source = map.getSource(RIDE_SOURCE_ID) as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (source) {
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: segments.filter((segment) => segment.length >= 2),
      },
    });
  } else {
    addRideLayer(map, segments);
  }
}

export function removeRideLayer(map: mapboxgl.Map): void {
  if (map.getLayer(RIDE_LINE_ID)) map.removeLayer(RIDE_LINE_ID);
  if (map.getSource(RIDE_SOURCE_ID)) map.removeSource(RIDE_SOURCE_ID);
}

// Trail auto-detection: given a GPS coordinate, returns the trail name at that
// point using a screen-space tolerance, or null if not on any trail.
export function detectTrailAtPoint(
  map: mapboxgl.Map,
  lngLat: [number, number],
): string | null {
  const point = map.project(new mapboxgl.LngLat(lngLat[0], lngLat[1]));

  // If the point is off-screen, we can't query rendered features
  const canvas = map.getCanvas();
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x > canvas.width ||
    point.y > canvas.height
  ) {
    return null;
  }

  const features = queryNearbyLineFeatures(
    map,
    point,
    TRAIL_LAYERS.map((cfg) => cfg.layerId),
  );
  if (features.length === 0) return null;

  const feature = features[0];
  const layerId = feature.layer?.id;
  if (!layerId) return null;

  // Find the matching TRAIL_LAYERS config to get the correct property name
  const cfg = TRAIL_LAYERS.find((c) => c.layerId === layerId);
  if (!cfg) return null;

  const rawName = feature.properties?.[cfg.trailProp];
  if (!rawName) return null;

  // osmId-matched layers carry a raw OSM_ID; resolve it to the curated trail
  // name (same as the map-click handler) so auto-detect dispatches a real
  // trailName, not a numeric id that can't be looked up.
  if (cfg.matchBy === 'osmId') {
    return trailNameForOsmId(rawName);
  }

  // Map through city metadata for display names when a tileset uses raw GIS
  // values (e.g. Godsey Ridge in Chattanooga).
  const meta = trailMetadata[rawName];
  return meta?.displayName ?? rawName;
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
