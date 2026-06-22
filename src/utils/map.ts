import mapboxgl from 'mapbox-gl';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import {
  mountainBikeConfig,
  mountainBikeTrails,
  regionFor,
  trailMetadata,
} from '@/data/geo_data';
import { RATING_COLORS, UNRATED_COLOR } from '@/data/trail-metadata';
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
  return bounds.isEmpty() ? null : bounds;
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
  for (const cfg of TRAIL_LAYERS) {
    const source = sourceIdForLayer(map, cfg);
    if (!source) continue;

    const features = map.querySourceFeatures(source, {
      sourceLayer: cfg.sourceLayer,
      filter: trailMatchExpr(cfg, trailName),
    });

    if (features.length === 0) continue;

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
  sourceId?: string;
  tilesetUrl?: string;
  matchBy?: 'name' | 'osmId';
  // Maps the raw feature-property value (e.g. tileset 'Trail' name) to the
  // line color. Falls back to UNRATED_COLOR for anything unlisted.
  colorMap: Record<string, string>;
  // Maps the user-facing displayName to the raw feature value used for
  // selection/highlight match expressions. Identity for layers whose tileset
  // trail names already match our displayNames.
  toRawName: (displayName: string) => string;
}

// Look up a curated trail by its trailName (used to resolve osmIds for layers
// that match by OSM_ID rather than by name).
const TRAIL_BY_NAME = new Map(mountainBikeTrails.map((t) => [t.trailName, t]));

// A single OSM way can be shared by several curated trails (named trails that
// physically overlap on one way). Pick ONE deterministic owner per way id so
// that the rendered color and a click's resolved trail always agree — never a
// silent array-order tiebreak. Owner = most specific (fewest ways), then
// shortest, then name, so a short trail that *is* the way wins over a long
// trail merely passing through it.
const OSM_ID_OWNER: Map<string, MountainBikeTrail> = (() => {
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
  for (const trail of mountainBikeTrails) {
    for (const id of trail.osmIds ?? []) {
      const key = String(id);
      const cur = owner.get(key);
      if (!cur || moreSpecific(trail, cur)) owner.set(key, trail);
    }
  }
  return owner;
})();

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
    const ids = (TRAIL_BY_NAME.get(trailName)?.osmIds ?? []).map(String);
    return ['in', ['to-string', ['get', 'OSM_ID']], ['literal', ids]];
  }
  return ['==', ['get', cfg.trailProp], cfg.toRawName(trailName)];
}

// Reverse lookup for osmId-matched layers: which curated trail owns this way?
// Uses the same deterministic owner as the color expression so a clicked
// segment's name and its color can never disagree.
export function trailNameForOsmId(osmId: string | number): string | null {
  return OSM_ID_OWNER.get(String(osmId))?.trailName ?? null;
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
      for (const [id, trail] of OSM_ID_OWNER) colorMap[id] = trail.color;
    } else if (hasMetadata) {
      colorMap = Object.fromEntries(
        Object.entries(metadata).map(([rawName, meta]) => [
          rawName,
          RATING_COLORS[meta.rating] ?? UNRATED_COLOR,
        ]),
      );
    } else {
      colorMap = Object.fromEntries(
        mountainBikeTrails.map((trail) => [trail.trailName, trail.color]),
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
function hitId(layerId: string): string {
  return `${layerId} Hit`;
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

// Attach any city-managed curated trail tilesets that are not already baked
// into the Mapbox Studio style. Idempotent: skips existing sources/layers.
export function ensureMtnBikeSource(map: mapboxgl.Map): void {
  try {
    for (const cfg of TRAIL_LAYERS) {
      if (!cfg.sourceId || !cfg.tilesetUrl) continue;

      if (!map.getSource(cfg.sourceId)) {
        map.addSource(cfg.sourceId, {
          type: 'vector',
          url: cfg.tilesetUrl,
        });
      }
      if (map.getLayer(cfg.layerId)) continue;

      map.addLayer({
        id: cfg.layerId,
        type: 'line',
        source: cfg.sourceId,
        'source-layer': cfg.sourceLayer,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-round-limit': 0.1,
        },
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
    if (!map.getSource(OSM_TRAILS_SOURCE_ID)) {
      map.addSource(OSM_TRAILS_SOURCE_ID, {
        type: 'vector',
        url: OSM_TRAILS_TILEJSON_URL,
      });
    }

    const firstCuratedLayer = TRAIL_LAYERS.find((cfg) =>
      map.getLayer(cfg.layerId),
    );
    const beforeId = firstCuratedLayer?.layerId;

    // When a curated layer renders from this same source by OSM_ID (e.g. Bend),
    // exclude those way ids here so curated trails aren't stroked twice and so
    // curated clicks win over the nationwide hit layer.
    const curatedIds = mountainBikeConfig.layers.some(
      (l) => l.matchBy === 'osmId',
    )
      ? mountainBikeTrails.flatMap((t) => t.osmIds ?? []).map(String)
      : [];
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
      layout: {
        'line-cap': 'round' as const,
        'line-join': 'round' as const,
        visibility: 'none' as const,
      },
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
  const value = visible ? 'visible' : 'none';
  for (const id of [
    OSM_TRAILS_CASING_LAYER_ID,
    OSM_TRAILS_LAYER_ID,
    OSM_TRAILS_HIT_LAYER_ID,
    OSM_POI_LAYER_ID,
  ]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', value);
    }
  }
}

// Anchor runtime overlays just beneath the first label so place/road names stay
// legible. Undefined when the style has no symbol layers — then there are no
// labels to obscure, so addLayer's default (append on top) is fine.
function firstSymbolLayerId(map: mapboxgl.Map): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
}

const ROUND_LINE = {
  'line-cap': 'round' as const,
  'line-join': 'round' as const,
};

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
    if (!map.getSource(BIKE_NETWORK_SOURCE_ID)) {
      map.addSource(BIKE_NETWORK_SOURCE_ID, { type: 'geojson', data: url });
    }
    const beforeId = firstSymbolLayerId(map);
    for (const l of BIKE_NETWORK_LAYERS) {
      if (map.getLayer(l.id)) continue;
      map.addLayer(
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
  const value = visible ? 'visible' : 'none';
  for (const l of BIKE_NETWORK_LAYERS) {
    if (map.getLayer(l.id)) {
      map.setLayoutProperty(l.id, 'visibility', value);
    }
  }
}

// --- Inline (GeoJSON-backed) bike routes -------------------------------------

const INLINE_ROUTES_SOURCE_ID = 'inline-routes-source';

// Attach curated routes whose geometry ships as a static GeoJSON (one feature
// per route, keyed by `id`) rather than a Mapbox Studio layer. Each route gets a
// white casing, the colored line (`id === route.id`), and a wide transparent hit
// target — the same `${route.id}` / `-casing` / `-hit` layer ids the existing
// route selection, opacity, and click-handler code keys off, so they work
// unchanged. Idempotent.
export function ensureInlineRoutes(
  map: mapboxgl.Map,
  url: string,
  routes: BikeRoute[],
): void {
  try {
    if (!map.getSource(INLINE_ROUTES_SOURCE_ID)) {
      map.addSource(INLINE_ROUTES_SOURCE_ID, { type: 'geojson', data: url });
    }
    const beforeId = firstSymbolLayerId(map);
    for (const route of routes) {
      const filter: mapboxgl.FilterSpecification = [
        '==',
        ['get', 'id'],
        route.id,
      ];
      const sublayers = [
        {
          id: `${route.id}-casing`,
          color: '#ffffff',
          width: route.defaultWidth + 2,
          opacity: 0.4,
        },
        {
          id: route.id,
          color: route.color,
          width: route.defaultWidth,
          opacity: route.opacity,
        },
        { id: `${route.id}-hit`, color: '#000000', width: 24, opacity: 0 },
      ];
      for (const s of sublayers) {
        if (map.getLayer(s.id)) continue;
        map.addLayer(
          {
            id: s.id,
            type: 'line',
            source: INLINE_ROUTES_SOURCE_ID,
            filter,
            layout: ROUND_LINE,
            paint: {
              'line-color': s.color,
              'line-width': s.width,
              'line-opacity': s.opacity,
            },
          },
          beforeId,
        );
      }
    }
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
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: OSM_HL_LINE_ID,
    type: 'line',
    source: OSM_HL_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
    const geom = feature.geometry;
    if (geom.type === 'LineString') {
      lines.push(geom.coordinates as [number, number][]);
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        lines.push(line as [number, number][]);
      }
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

  map.on('mouseenter', OSM_TRAILS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', OSM_TRAILS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = '';
  });

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
  hideStyleLayers(map, mountainBikeConfig.strayStyleLayers);
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
    const hId = hitId(cfg.layerId);

    if (!map.getLayer(cId)) {
      map.addLayer(
        {
          id: cId,
          type: 'line',
          source,
          'source-layer': cfg.sourceLayer,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            'line-round-limit': 0.1,
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 5,
            'line-opacity': 0.5,
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
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            'line-round-limit': 0.1,
          },
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
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-round-limit': 0.1,
        },
        paint: {
          'line-color': 'rgba(0,0,0,0)',
          'line-width': 10,
          'line-opacity': 0,
        },
      });
    }

    map.setLayoutProperty(cfg.layerId, 'line-cap', 'round');
    map.setLayoutProperty(cfg.layerId, 'line-join', 'round');
    map.setLayoutProperty(cfg.layerId, 'line-round-limit', 0.1);

    // For OSM-tileset-backed layers (nationwide source), restrict rendering to
    // the union of curated way ids — otherwise the layer would draw every trail
    // in the country. For name-based tilesets, just hide trails that overlap
    // bike route layers.
    let filter: mapboxgl.FilterSpecification | null = null;
    if (cfg.matchBy === 'osmId') {
      const curatedIds = mountainBikeTrails
        .flatMap((t) => t.osmIds ?? [])
        .map(String);
      filter = [
        'in',
        ['to-string', ['get', 'OSM_ID']],
        ['literal', curatedIds],
      ];
    } else if (mountainBikeConfig.hiddenTrails.length > 0) {
      filter = [
        '!',
        [
          'in',
          ['get', cfg.trailProp],
          ['literal', mountainBikeConfig.hiddenTrails],
        ],
      ];
    }
    if (filter) {
      for (const id of [cfg.layerId, cId, gId, hId]) {
        if (map.getLayer(id)) {
          map.setFilter(id, filter);
        }
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

// Trail auto-detection: given a GPS coordinate, returns the trail name at that
// point (using the invisible hit-test layers), or null if not on any trail.
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

  const hitLayerIds = TRAIL_LAYERS.map((cfg) => hitId(cfg.layerId));

  // Only query layers that actually exist on the map
  const activeLayers = hitLayerIds.filter((id) => map.getLayer(id));
  if (activeLayers.length === 0) return null;

  const features = map.queryRenderedFeatures(point, {
    layers: activeLayers,
  });
  if (features.length === 0) return null;

  const feature = features[0];
  const layerId = feature.layer?.id;
  if (!layerId) return null;

  // Find the matching TRAIL_LAYERS config to get the correct property name
  const cfg = TRAIL_LAYERS.find((c) => hitId(c.layerId) === layerId);
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
