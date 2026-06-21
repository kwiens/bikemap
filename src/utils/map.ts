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
      filter: ['==', ['get', cfg.trailProp], cfg.toRawName(trailName)],
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
  // Maps the raw feature-property value (e.g. tileset 'Trail' name) to the
  // line color. Falls back to UNRATED_COLOR for anything unlisted.
  colorMap: Record<string, string>;
  // Maps the user-facing displayName to the raw feature value used for
  // selection/highlight match expressions. Identity for layers whose tileset
  // trail names already match our displayNames.
  toRawName: (displayName: string) => string;
}

function buildColorExpression(
  trailProp: string,
  colorMap: Record<string, string>,
): mapboxgl.Expression {
  const entries: (string | mapboxgl.Expression)[] = [
    'match',
    ['get', trailProp],
  ];
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
    const colorMap = hasMetadata
      ? Object.fromEntries(
          Object.entries(metadata).map(([rawName, meta]) => [
            rawName,
            RATING_COLORS[meta.rating] ?? UNRATED_COLOR,
          ]),
        )
      : Object.fromEntries(
          mountainBikeTrails.map((trail) => [trail.trailName, trail.color]),
        );
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

    const baseLine = {
      type: 'line' as const,
      source: OSM_TRAILS_SOURCE_ID,
      'source-layer': OSM_TRAILS_SOURCE_LAYER,
      minzoom: OSM_TRAILS_MIN_ZOOM,
      filter: OSM_BIKE_TRAIL_FILTER,
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
          buildColorExpression(cfg.trailProp, cfg.colorMap),
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

    // Hide trails that overlap with bike route layers
    if (mountainBikeConfig.hiddenTrails.length > 0) {
      const filter: mapboxgl.FilterSpecification = [
        '!',
        [
          'in',
          ['get', cfg.trailProp],
          ['literal', mountainBikeConfig.hiddenTrails],
        ],
      ];
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
  const prop = cfg.trailProp;
  const matchValue = selectedTrailName
    ? cfg.toRawName(selectedTrailName)
    : null;

  const cId = casingId(cfg.layerId);
  const gId = glowId(cfg.layerId);

  if (selectedTrailName) {
    map.setPaintProperty(cfg.layerId, 'line-opacity', [
      'case',
      ['==', ['get', prop], matchValue],
      0.9,
      0.5,
    ]);
    map.setPaintProperty(cfg.layerId, 'line-width', [
      'case',
      ['==', ['get', prop], matchValue],
      4,
      3,
    ]);

    if (map.getLayer(cId)) {
      map.setPaintProperty(cId, 'line-opacity', [
        'case',
        ['==', ['get', prop], matchValue],
        0.9,
        0.5,
      ]);
      map.setPaintProperty(cId, 'line-width', [
        'case',
        ['==', ['get', prop], matchValue],
        6,
        5,
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

    // Map our trail names to raw feature property values
    const rawNames = matchedTrails.map((t) => cfg.toRawName(t.trailName));

    const cId = casingId(cfg.layerId);
    const gId = glowId(cfg.layerId);

    try {
      map.setPaintProperty(cfg.layerId, 'line-opacity', [
        'match',
        ['get', cfg.trailProp],
        rawNames,
        0.9,
        0.4,
      ]);
      map.setPaintProperty(cfg.layerId, 'line-width', [
        'match',
        ['get', cfg.trailProp],
        rawNames,
        3,
        3,
      ]);

      if (map.getLayer(cId)) {
        map.setPaintProperty(cId, 'line-opacity', [
          'match',
          ['get', cfg.trailProp],
          rawNames,
          0.6,
          0.4,
        ]);
        map.setPaintProperty(cId, 'line-width', [
          'match',
          ['get', cfg.trailProp],
          rawNames,
          5,
          5,
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
