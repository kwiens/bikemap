import type { PayloadHandler } from 'payload';
import { fetchTrailNetwork, OverpassError } from '@/payload/osm/overpass';
import { NETWORK_CELL_DEG, type NetworkWay } from '@/payload/osm/trail-network';

export interface TrailNetworkResponse {
  ways: NetworkWay[];
}

/** The widest box accepted on either axis: one grid cell. */
const MAX_SPAN_DEG = NETWORK_CELL_DEG;

/**
 * How long a box stays cached. Trail geometry in OSM changes on the order of
 * days, and every miss here is a request against the public Overpass instance.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/**
 * A busy trail cell is a few MB of JSON, and this lives in server memory, so
 * the cache holds about one editing session's worth rather than a region's.
 */
const MAX_CACHED_BOXES = 16;

/**
 * Cached boxes, in insertion order so the oldest is evicted first.
 *
 * Per server instance and lost on restart. That's enough: the client asks for
 * fixed grid cells, so an editor panning around one trail area asks for the
 * same few boxes over and over.
 */
const cache = new Map<string, { at: number; ways: NetworkWay[] }>();

/**
 * Overpass requests in flight, by box. A second request for a box that is
 * still loading — another editor, or a retry — waits on the first rather than
 * sending the shared endpoint the same query twice.
 */
const inFlight = new Map<string, Promise<NetworkWay[]>>();

/**
 * The OSM trail network in a box, for the trail editor's Follow trails mode.
 *
 * `GET /api/trails/network?bbox=west,south,east,north`. Admin only: it proxies
 * a shared community endpoint, and nothing public needs it.
 */
export const trailNetwork: PayloadHandler = async (req) => {
  if (req.user?.role !== 'admin') {
    return req.user
      ? Response.json(
          { message: 'Only admins can load trails.' },
          { status: 403 },
        )
      : Response.json({ message: 'Sign in to load trails.' }, { status: 401 });
  }

  const bbox = parseBbox(req.searchParams.get('bbox'));
  if (!bbox) {
    return Response.json(
      {
        message: `bbox must be west,south,east,north and at most ${MAX_SPAN_DEG}° across.`,
      },
      { status: 400 },
    );
  }

  const key = bbox.join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return respond(hit.ways);
  }

  try {
    return respond(await loadBox(key, bbox));
  } catch (error) {
    const message =
      error instanceof OverpassError
        ? error.message
        : 'The trail network could not be loaded from OpenStreetMap.';
    req.payload.logger.warn({
      err: error,
      msg: `Trail network ${key}: ${message}`,
    });
    return Response.json({ message }, { status: 502 });
  }
};

/**
 * Fetches a box once, however many requests ask for it at the same time.
 *
 * Deliberately not tied to any one request's abort signal: a shared fetch
 * cancelled by whoever asked first would fail everyone waiting on it.
 */
function loadBox(
  key: string,
  bbox: [number, number, number, number],
): Promise<NetworkWay[]> {
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }
  const request = fetchTrailNetwork(bbox)
    .then((ways) => {
      cache.delete(key);
      cache.set(key, { at: Date.now(), ways });
      while (cache.size > MAX_CACHED_BOXES) {
        cache.delete(cache.keys().next().value as string);
      }
      return ways;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/** Empties the cache. For tests, which share one module instance. */
export function clearTrailNetworkCache(): void {
  cache.clear();
  inFlight.clear();
}

function respond(ways: NetworkWay[]): Response {
  return Response.json({ ways } satisfies TrailNetworkResponse, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}

function parseBbox(
  value: string | null,
): [number, number, number, number] | null {
  const numbers = (value ?? '').split(',').map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) {
    return null;
  }
  const [west, south, east, north] = numbers;
  const valid =
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north &&
    // A hair of slack for the client's rounding of cell edges.
    east - west <= MAX_SPAN_DEG + 1e-9 &&
    north - south <= MAX_SPAN_DEG + 1e-9;
  return valid ? [west, south, east, north] : null;
}
