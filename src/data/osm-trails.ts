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

type OsmTrailProps = Record<string, unknown>;

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

// mtb:scale 0–6 grouped into the same easy/intermediate/advanced/expert buckets
// the line coloring uses.
const MTB_SCALE_LABELS: Record<string, string> = {
  '0': 'Easy',
  '1': 'Intermediate',
  '2': 'Advanced',
  '3': 'Advanced',
  '4': 'Expert',
  '5': 'Expert',
  '6': 'Expert',
};

// OSM names/tags are arbitrary user-generated text — always escape before
// injecting into popup HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  return `https://www.openstreetmap.org/${type}/${id}`;
}

/** Human-readable label/value rows derived from a trail feature's OSM tags. */
export function osmTrailDetailRows(props: OsmTrailProps): [string, string][] {
  const rows: [string, string][] = [];

  const highway = str(props.highway);
  if (highway) {
    rows.push(['Type', HIGHWAY_LABELS[highway] ?? titleCase(highway)]);
  }

  const scale = str(props['mtb:scale']);
  if (scale) {
    const label = MTB_SCALE_LABELS[scale] ?? 'Advanced';
    rows.push(['Difficulty', `${label} (mtb:scale ${scale})`]);
  }

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
  const rows = osmTrailDetailRows(props);

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<span class="osm-trail-tag"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</span>`,
    )
    .join('');

  const url = osmFeatureUrl(props);
  const link = url
    ? `<p class="osm-trail-source"><a href="${url}" target="_blank" rel="noopener noreferrer">View on OpenStreetMap</a></p>`
    : '';

  return `<div class="map-popup osm-trail-popup"><h3>${escapeHtml(name)}</h3>${
    rowsHtml ? `<div class="osm-trail-tags">${rowsHtml}</div>` : ''
  }${link}</div>`;
}
