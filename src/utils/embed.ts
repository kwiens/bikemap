// Embed mode (`/embed`): the map framed on a third-party site.
//
// Everything the host page can configure travels in the iframe `src` query
// string — never cookies or localStorage, which browsers partition or drop
// inside a third-party frame. `parseEmbedOptions` is the single decoder;
// `buildEmbedSearch` is its inverse (used by the demo/snippet builder).

/** Marker/overlay layers a host page may turn on at load. */
export const EMBED_LAYERS = [
  'attractions',
  'bikeResources',
  'bikeRentals',
  'bikeNetwork',
] as const;

export type EmbedLayer = (typeof EMBED_LAYERS)[number];

export interface EmbedOptions {
  /** Whether the routes sidebar starts open. Defaults to closed — a 280px
   *  drawer eats most of a typical embed width. */
  sidebarOpen: boolean;
  /** Route slug (see `slugify(route.name)`) to select once the map is ready. */
  route?: string;
  /** Initial map center as [lng, lat]; falls back to the city default. */
  center?: [number, number];
  /** Initial zoom; falls back to the city default. */
  zoom?: number;
  /** Layers switched on at load. */
  layers: EmbedLayer[];
}

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {
  sidebarOpen: false,
  layers: [],
};

/**
 * Decode `/embed?...` query params into options. Unknown or malformed values
 * fall back to defaults rather than throwing — a bad partner snippet should
 * still render a map.
 *
 * Supported params:
 *   sidebar=open|closed
 *   route=<slug>
 *   center=<lng>,<lat>
 *   zoom=<number>
 *   layers=attractions,bikeResources,bikeRentals,bikeNetwork  (comma list)
 */
export function parseEmbedOptions(
  search: string | URLSearchParams,
): EmbedOptions {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;

  const options: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, layers: [] };

  const sidebar = params.get('sidebar');
  if (sidebar === 'open') options.sidebarOpen = true;
  else if (sidebar === 'closed') options.sidebarOpen = false;

  const route = params.get('route')?.trim();
  if (route) options.route = route;

  const center = parseCenter(params.get('center'));
  if (center) options.center = center;

  const zoom = parseZoom(params.get('zoom'));
  if (zoom !== undefined) options.zoom = zoom;

  options.layers = parseLayers(params.get('layers'));

  return options;
}

/**
 * Encode options back into a query string (no leading `?`). Only emits values
 * that differ from the defaults so generated snippets stay short.
 */
export function buildEmbedSearch(options: Partial<EmbedOptions>): string {
  const params = new URLSearchParams();
  if (options.sidebarOpen) params.set('sidebar', 'open');
  if (options.route) params.set('route', options.route);
  if (options.center) {
    params.set('center', options.center.map(formatCoord).join(','));
  }
  if (options.zoom !== undefined) params.set('zoom', String(options.zoom));
  if (options.layers && options.layers.length > 0) {
    params.set('layers', options.layers.join(','));
  }
  return params.toString();
}

/** Type guard used by the parser and by UI that reads user-entered layer names. */
export function isEmbedLayer(value: string): value is EmbedLayer {
  return (EMBED_LAYERS as readonly string[]).includes(value);
}

function parseCenter(raw: string | null): [number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return undefined;
  }
  const [lng, lat] = parts;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined;
  return [lng, lat];
}

function parseZoom(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const zoom = Number(raw);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) return undefined;
  return zoom;
}

function parseLayers(raw: string | null): EmbedLayer[] {
  if (!raw) return [];
  const seen = new Set<EmbedLayer>();
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (isEmbedLayer(name)) seen.add(name);
  }
  return [...seen];
}

function formatCoord(n: number): string {
  // 5 decimals ≈ 1 m; keeps snippets readable.
  return String(Math.round(n * 1e5) / 1e5);
}
