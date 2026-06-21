import { escapeXml } from '@/utils/gpx';

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

// --- Click popup ------------------------------------------------------------
// OSM trails carry no curated metadata (unlike the local MTB trails), so a
// click opens a Mapbox popup built straight from the feature's OSM tags.

interface OsmTrailProps {
  [key: string]: unknown;
}

export type TrailRating = 'easy' | 'intermediate' | 'advanced' | 'expert';

const HIGHWAY_LABELS: Record<string, string> = {
  path: 'Path',
  cycleway: 'Cycleway',
  track: 'Track',
  footway: 'Footway',
  bridleway: 'Bridleway',
  pedestrian: 'Pedestrian way',
  steps: 'Steps',
  service: 'Service road',
};

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
// them. Both the line color expression (utils/map.ts) and the popup badge derive
// from this map so the rendered color and the badge can never disagree. The raw
// scale number is an internal OSM reference and is never surfaced in the UI.
function buildScaleRatingMap(): Record<string, TrailRating> {
  const out: Record<string, TrailRating> = {};
  for (const [digit, rating] of Object.entries(SCALE_DIGIT_RATING)) {
    for (const suffix of ['', '+', '-']) out[`${digit}${suffix}`] = rating;
  }
  return out;
}

export const MTB_SCALE_RATING = buildScaleRatingMap();

const RATING_LABEL: Record<TrailRating, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

// Title-case, Unicode-aware so accented OSM values (e.g. "éboulis") capitalize.
function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

function str(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/** Link to the feature on openstreetmap.org, or null when there's no OSM id. */
function osmFeatureUrl(props: OsmTrailProps): string | null {
  const id = str(props.OSM_ID);
  if (!id) return null;
  const raw = str(props.OSM_TYPE).toLowerCase();
  const type = raw.startsWith('n')
    ? 'node'
    : raw.startsWith('r')
      ? 'relation'
      : 'way';
  // Encode the id (OSM ids are numeric today, but defend against unexpected
  // values) — the type is from a fixed whitelist above.
  return `https://www.openstreetmap.org/${type}/${encodeURIComponent(id)}`;
}

/** Trail type label (e.g. "Cycleway"), or null when untagged. */
export function osmTrailType(props: OsmTrailProps): string | null {
  const highway = str(props.highway);
  if (!highway) return null;
  return HIGHWAY_LABELS[highway] ?? titleCase(highway);
}

/** Difficulty derived from mtb:scale (label + rating bucket), or null. */
export function osmTrailDifficulty(
  props: OsmTrailProps,
): { label: string; rating: TrailRating } | null {
  const scale = str(props['mtb:scale']);
  if (!scale) return null;
  // Fall back to the leading digit for any token not in the map.
  const rating = MTB_SCALE_RATING[scale] ?? SCALE_DIGIT_RATING[scale.charAt(0)];
  if (!rating) return null;
  return { label: RATING_LABEL[rating], rating };
}

/** Secondary detail rows (surface, bike access, operator) for the popup body. */
export function osmTrailDetailRows(props: OsmTrailProps): [string, string][] {
  const rows: [string, string][] = [];

  const surface = str(props.surface);
  if (surface) rows.push(['Surface', titleCase(surface)]);

  const bicycle = str(props.bicycle);
  if (bicycle) rows.push(['Bikes', titleCase(bicycle)]);

  const operator = str(props.operator);
  if (operator) rows.push(['Operator', operator]);

  return rows;
}

/** Build the popup HTML for a clicked OSM trail feature (escaped). */
export function buildOsmTrailPopupHTML(props: OsmTrailProps): string {
  const name = str(props.name) || 'Unnamed trail';
  const type = osmTrailType(props);
  const difficulty = osmTrailDifficulty(props);
  const rows = osmTrailDetailRows(props);

  const badge = difficulty
    ? `<span class="osm-trail-badge osm-trail-badge--${difficulty.rating}">${escapeXml(difficulty.label)}</span>`
    : '';
  const typeLabel = type
    ? `<span class="osm-trail-type">${escapeXml(type)}</span>`
    : '';
  const subhead =
    badge || typeLabel
      ? `<div class="osm-trail-subhead">${badge}${typeLabel}</div>`
      : '';

  const facts = rows
    .map(
      ([k, v]) =>
        `<div class="osm-trail-fact"><dt>${escapeXml(k)}</dt><dd>${escapeXml(v)}</dd></div>`,
    )
    .join('');
  const factsHtml = facts ? `<dl class="osm-trail-facts">${facts}</dl>` : '';

  const url = osmFeatureUrl(props);
  const link = url
    ? `<div class="osm-trail-source"><a href="${escapeXml(url)}" target="_blank" rel="noopener noreferrer">View on OpenStreetMap</a></div>`
    : '';

  return `<div class="map-popup osm-trail-popup"><h3 class="osm-trail-name">${escapeXml(name)}</h3>${subhead}${factsHtml}${link}</div>`;
}
