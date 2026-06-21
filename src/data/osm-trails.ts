// Nationwide OSM bike trails, served as vector tiles by OpenStreetMap US.
// https://openstreetmap.us/our-work/tileservice/
//
// Like the MTB tileset, this source is NOT part of the Mapbox Studio style —
// we attach it ourselves at runtime (see ensureOsmTrailsSource in utils/map.ts)
// from the public TileJSON. The `trail` source-layer carries OSM access and
// difficulty tags (bicycle, mtb:scale, highway, surface, name, …) that we
// filter and color on. The layer is hidden by default and toggled from the
// "Map Layers" sidebar section.

export const OSM_TRAILS_SOURCE_ID = 'osm-trails-source';
export const OSM_TRAILS_LAYER_ID = 'osm-trails';
export const OSM_TRAILS_CASING_LAYER_ID = 'osm-trails-casing';
// Transparent, extra-wide line layer above the trails purely as a tap target —
// the visible lines are 1–2.5px and hard to click, especially on mobile.
export const OSM_TRAILS_HIT_LAYER_ID = 'osm-trails-hit';
export const OSM_POI_LAYER_ID = 'osm-trail-poi';

// Vector layer inside the tileset that holds path/trail line geometry.
export const OSM_TRAILS_SOURCE_LAYER = 'trail';

// Vector layer holding trail points of interest (parking, information boards,
// shelters, water, …). We surface trailhead parking and information points,
// rendered with Maki icons from the Mapbox style sprite.
export const OSM_POI_SOURCE_LAYER = 'trail_poi';

// TileJSON describing the tiles, min/max zoom, and attribution. Passing the
// TileJSON URL (rather than a raw {z}/{x}/{y} template) lets Mapbox pick up
// the "© OpenStreetMap contributors" attribution and zoom bounds for free.
export const OSM_TRAILS_TILEJSON_URL =
  'https://tiles.openstreetmap.us/vector/trails.json';

// --- mtb:scale → difficulty --------------------------------------------------

export type TrailRating = 'easy' | 'intermediate' | 'advanced' | 'expert';

// The bucket a single mtb:scale digit (0–6) falls into.
const SCALE_DIGIT_RATING: Record<string, TrailRating> = {
  '0': 'easy',
  '1': 'intermediate',
  '2': 'advanced',
  '3': 'advanced',
  '4': 'expert',
  '5': 'expert',
  '6': 'expert',
};

// Single source of truth: every mtb:scale token → difficulty bucket. OSM uses
// 0–6 with optional +/- refinements (e.g. "4+"), so expand the digits to cover
// them. The line color expression (utils/map.ts) derives from this map. The raw
// scale number is an internal OSM reference and is never surfaced in the UI.
function buildScaleRatingMap(): Record<string, TrailRating> {
  const out: Record<string, TrailRating> = {};
  for (const [digit, rating] of Object.entries(SCALE_DIGIT_RATING)) {
    for (const suffix of ['', '+', '-']) out[`${digit}${suffix}`] = rating;
  }
  return out;
}

export const MTB_SCALE_RATING = buildScaleRatingMap();
