/**
 * Overpass API client — fetches OSM way geometry by id, server-side.
 *
 * Why Overpass rather than the vector tiles the map already renders: tile
 * geometry is simplified and clipped at tile boundaries, so a way crossing a
 * tile edge comes back in pieces at reduced precision. Overpass returns the
 * full-resolution way and the real OSM ids, which is what we want to store.
 * (This mirrors the choice made in scripts/osm_trail_elevation.py.)
 *
 * The public endpoint is a shared community resource. Requests here are
 * deliberately small — a handful of way ids from one editor pressing save —
 * and must send a User-Agent or Overpass answers 406.
 */

/** A single OSM way with its full-resolution geometry. */
export interface OsmWay {
  /** [lng, lat] positions, in the way's own node order. */
  coordinates: [number, number][];
  id: number;
  tags: Record<string, string>;
}

export interface OverpassOptions {
  /** Overpass endpoint; override to use a private or self-hosted instance. */
  endpoint?: string;
  signal?: AbortSignal;
  /** Server-side query budget, in seconds, passed to Overpass itself. */
  timeoutSeconds?: number;
}

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// Overpass rejects requests without one (HTTP 406). Identify the app so
// operators can see who's calling.
const USER_AGENT =
  'open-bike-map/1.0 (+https://github.com/kwiens/bikemap; trail editor)';

/**
 * Guards against a runaway request from a bad paste. A curated trail is
 * assembled from a handful of ways; hundreds means something is wrong.
 */
export const MAX_WAYS_PER_REQUEST = 100;

interface OverpassElement {
  geometry?: { lat: number; lon: number }[];
  id: number;
  tags?: Record<string, string>;
  type: string;
}

export class OverpassError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OverpassError';
  }
}

/**
 * Statuses that mean "busy, come back later" rather than "your query is wrong".
 * 429 is the rate limiter; 504 is the gateway giving up when slots are full.
 * Both are routine on the public endpoint and both succeed on a retry.
 */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestWithRetry(
  endpoint: string,
  query: string,
  options: OverpassOptions,
): Promise<Response> {
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(endpoint, {
      body: query,
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': USER_AGENT,
      },
      method: 'POST',
      signal: options.signal,
    });

    if (response.ok) {
      return response;
    }

    lastStatus = response.status;
    // Drain the body so the connection can be reused on the retry.
    await response.text().catch(() => undefined);

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      break;
    }

    // Exponential backoff. Overpass publishes a Retry-After only sometimes, so
    // honour it when present and fall back to doubling.
    const retryAfter = Number(response.headers.get('Retry-After'));
    const waitMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : BASE_BACKOFF_MS * 2 ** (attempt - 1);
    await sleep(waitMs);
  }

  throw new OverpassError(
    RETRYABLE_STATUSES.has(lastStatus ?? 0)
      ? `Overpass is busy (HTTP ${lastStatus}) and did not recover after ${MAX_ATTEMPTS} attempts. This usually clears on its own — try saving again shortly.`
      : `Overpass request failed with HTTP ${lastStatus}`,
    lastStatus,
  );
}

/**
 * Fetches the given ways with their geometry.
 *
 * Returns only the ways Overpass knew about — a way that has been deleted or
 * renumbered upstream simply won't be in the result. Callers must diff against
 * what they asked for rather than assuming completeness; that difference is how
 * we detect the id drift that OSM references are prone to.
 */
export async function fetchWaysByIds(
  ids: number[],
  options: OverpassOptions = {},
): Promise<OsmWay[]> {
  const unique = [...new Set(ids)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );

  if (unique.length === 0) {
    return [];
  }
  if (unique.length > MAX_WAYS_PER_REQUEST) {
    throw new OverpassError(
      `Refusing to request ${unique.length} ways at once (limit ${MAX_WAYS_PER_REQUEST}).`,
    );
  }

  const timeout = options.timeoutSeconds ?? 60;
  // `out geom` returns each way's node coordinates inline, which saves a second
  // round trip for the nodes.
  const query = `[out:json][timeout:${timeout}];way(id:${unique.join(',')});out geom tags;`;

  const response = await requestWithRetry(
    options.endpoint ?? DEFAULT_ENDPOINT,
    query,
    options,
  );

  const payload = (await response.json()) as { elements?: OverpassElement[] };

  return (payload.elements ?? [])
    .filter((element) => element.type === 'way' && element.geometry)
    .map((element) => ({
      coordinates: (element.geometry ?? []).map(
        ({ lat, lon }) => [lon, lat] as [number, number],
      ),
      id: element.id,
      tags: element.tags ?? {},
    }))
    .filter((way) => way.coordinates.length >= 2);
}
