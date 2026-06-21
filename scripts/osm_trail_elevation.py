"""
Precompute length + elevation for nationwide OSM bike trails, one region at a time.

The nationwide trails layer (tiles.openstreetmap.us) carries no length or
elevation, so today the client samples Mapbox Terrain-RGB on every click
(src/utils/osm-elevation.ts). This tool does that work offline for every
bike-relevant OSM way inside a bounding box and writes a compact lookup keyed by
OSM way id, so the client can render the popup instantly and only fall back to
on-demand sampling for ways we haven't precomputed.

Geometry comes from the Overpass API (full-resolution ways + real OSM ids that
match the tileset's OSM_ID), filtered to the same bike-relevant set as
OSM_BIKE_TRAIL_FILTER in src/utils/map.ts. Elevation comes from Mapbox
Terrain-RGB at z14 and is run through a port of computeElevation()
(src/utils/ride-stats.ts) so precomputed values match what the client would
have shown for the same geometry.

Output (designed to shard the whole country, one file per region):
  - public/data/osm-elevation/<region>.json  — { region, name, bbox, generatedAt,
      count, trails: { "<osmId>": [lengthM, gain, loss, min, max] } }   (meters)
  - public/data/osm-elevation/index.json      — manifest of regions + bboxes the
      client reads to decide which file to load for a clicked location.

Usage:
  python scripts/osm_trail_elevation.py --region oregon
  python scripts/osm_trail_elevation.py --bbox -124.57,41.99,-116.46,46.29 --region-name oregon
  python scripts/osm_trail_elevation.py --region all          # every US state (long!)

Requires: pip install -r scripts/requirements.txt
"""

import argparse
import json
import math
import os
import shlex
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO

from PIL import Image

# Reuse the app's token resolver and retry-configured HTTP session so token
# logic lives in exactly one place.
from add_trail_elevation import _get_mapbox_token, _session

# --- Constants ---------------------------------------------------------------

# Match the client's elevation sampling (src/utils/osm-elevation.ts) so
# precomputed values agree with the on-demand fallback.
TERRAIN_ZOOM = 14
TILE_SIZE = 256
SAMPLE_STEP_M = 20
EARTH_RADIUS_M = 6371000.0

# Ported verbatim from src/utils/ride-stats.ts. Keep in sync.
ELEVATION_DEAD_BAND = 3
ELEVATION_SPIKE_THRESHOLD = 25
ELEVATION_MIN_DISTANCE = 15
ELEVATION_SMOOTH_HALF = 5  # 11-point centered window
SPIKE_EMA_ALPHA = 0.3

OVERPASS_URL_DEFAULT = 'https://overpass-api.de/api/interpreter'
# Overpass rejects requests without a User-Agent (HTTP 406). Identify the tool.
OVERPASS_HEADERS = {'User-Agent': 'bikemap-osm-elevation/1.0 (+github.com/kwiens/bikemap)'}
# When set (--overpass-ssh user@host), Overpass queries run via `ssh host curl`
# instead of locally — used when the local IP is blocked/rate-limited. Elevation
# (Mapbox) still fetches locally. Set in main().
OVERPASS_SSH_HOST = None
# Split a region into cells of this size so each Overpass query stays small and
# resumable. Tune down if queries time out, up to make fewer requests.
CELL_DEG_DEFAULT = 0.5

OUTPUT_DIR = 'public/data/osm-elevation'
MANIFEST_PATH = os.path.join(OUTPUT_DIR, 'index.json')
TILE_CACHE_DIR = 'scripts/.tile_cache/terrain14'
OVERPASS_CACHE_DIR = 'scripts/.osm_cache'

# US state + DC bounding boxes as (minLng, minLat, maxLng, maxLat). Padded so a
# box always covers its state; slight overspill into neighbors is harmless (the
# extra trails just get precomputed too). This is what makes `--region <state>`
# and `--region all` work for the eventual nationwide run.
US_STATE_BBOX = {
    'alabama': (-88.5, 30.1, -84.8, 35.1),
    'alaska': (-179.2, 51.0, -129.9, 71.5),
    'arizona': (-114.9, 31.3, -109.0, 37.1),
    'arkansas': (-94.7, 33.0, -89.6, 36.6),
    'california': (-124.5, 32.5, -114.1, 42.1),
    'colorado': (-109.1, 36.9, -102.0, 41.1),
    'connecticut': (-73.8, 40.9, -71.7, 42.1),
    'delaware': (-75.8, 38.4, -75.0, 39.9),
    'florida': (-87.7, 24.4, -79.9, 31.1),
    'georgia': (-85.7, 30.3, -80.8, 35.1),
    'hawaii': (-160.3, 18.8, -154.7, 22.3),
    'idaho': (-117.3, 41.9, -111.0, 49.1),
    'illinois': (-91.6, 36.9, -87.4, 42.6),
    'indiana': (-88.1, 37.7, -84.7, 41.8),
    'iowa': (-96.7, 40.3, -90.1, 43.6),
    'kansas': (-102.1, 36.9, -94.5, 40.1),
    'kentucky': (-89.6, 36.4, -81.9, 39.2),
    'louisiana': (-94.1, 28.9, -88.7, 33.1),
    'maine': (-71.2, 42.9, -66.8, 47.5),
    'maryland': (-79.5, 37.8, -75.0, 39.8),
    'massachusetts': (-73.6, 41.2, -69.8, 42.9),
    'michigan': (-90.5, 41.6, -82.3, 48.4),
    'minnesota': (-97.3, 43.4, -89.4, 49.5),
    'mississippi': (-91.7, 30.1, -88.0, 35.1),
    'missouri': (-95.9, 35.9, -89.0, 40.7),
    'montana': (-116.1, 44.3, -104.0, 49.1),
    'nebraska': (-104.1, 39.9, -95.2, 43.1),
    'nevada': (-120.1, 35.0, -114.0, 42.1),
    'new-hampshire': (-72.6, 42.6, -70.5, 45.4),
    'new-jersey': (-75.6, 38.8, -73.8, 41.4),
    'new-mexico': (-109.1, 31.2, -102.9, 37.1),
    'new-york': (-79.8, 40.4, -71.8, 45.1),
    'north-carolina': (-84.4, 33.7, -75.4, 36.7),
    'north-dakota': (-104.1, 45.9, -96.5, 49.1),
    'ohio': (-84.9, 38.3, -80.5, 42.4),
    'oklahoma': (-103.1, 33.6, -94.4, 37.1),
    'oregon': (-124.6, 41.9, -116.4, 46.3),
    'pennsylvania': (-80.6, 39.7, -74.6, 42.4),
    'rhode-island': (-71.9, 41.1, -71.1, 42.1),
    'south-carolina': (-83.4, 32.0, -78.5, 35.3),
    'south-dakota': (-104.1, 42.4, -96.4, 46.0),
    'tennessee': (-90.4, 34.9, -81.6, 36.8),
    'texas': (-106.7, 25.8, -93.5, 36.6),
    'utah': (-114.1, 36.9, -109.0, 42.1),
    'vermont': (-73.5, 42.7, -71.4, 45.1),
    'virginia': (-83.7, 36.5, -75.2, 39.5),
    'washington': (-124.9, 45.5, -116.9, 49.1),
    'west-virginia': (-82.7, 37.1, -77.7, 40.7),
    'wisconsin': (-92.9, 42.4, -86.8, 47.1),
    'wyoming': (-111.1, 40.9, -104.0, 45.1),
    'district-of-columbia': (-77.2, 38.7, -76.9, 39.0),
}


# --- Geometry helpers --------------------------------------------------------

def haversine_m(lng1, lat1, lng2, lat2):
    """Great-circle distance in meters (matches ride-stats haversineDistance)."""
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def line_length_m(line):
    """Total length of a [[lng, lat], ...] polyline in meters."""
    total = 0.0
    for i in range(1, len(line)):
        total += haversine_m(line[i - 1][0], line[i - 1][1],
                             line[i][0], line[i][1])
    return total


def densify_line(line, step_m=SAMPLE_STEP_M):
    """Insert points so no gap exceeds ~step_m (port of densifyLine)."""
    if len(line) < 2:
        return list(line)
    out = [line[0]]
    for i in range(1, len(line)):
        lng1, lat1 = line[i - 1]
        lng2, lat2 = line[i]
        dist = haversine_m(lng1, lat1, lng2, lat2)
        steps = max(1, int(dist // step_m))
        for k in range(1, steps + 1):
            t = k / steps
            out.append([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t])
    return out


# --- Mapbox Terrain-RGB ------------------------------------------------------

terrain_cache = {}
# Per-tile locks so concurrent workers dedupe fetches of the same tile while
# still fetching different tiles in parallel. _MISSING distinguishes "not cached"
# from a cached None (404).
_terrain_locks = {}
_terrain_locks_guard = threading.Lock()
_MISSING = object()


def _tile_lock(key):
    with _terrain_locks_guard:
        lock = _terrain_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _terrain_locks[key] = lock
        return lock


def _atomic_write(path, data):
    """Write via a temp file + rename so a crash never leaves a partial tile."""
    tmp = f'{path}.tmp{threading.get_ident()}'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)


def lng_lat_to_tile_pixel(lng, lat, z):
    """Return (tile_x, tile_y, px, py) for a lng/lat at zoom z."""
    scale = TILE_SIZE * (2 ** z)
    world_x = ((lng + 180) / 360) * scale
    sin_lat = math.sin(math.radians(lat))
    world_y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * scale
    x = int(world_x // TILE_SIZE)
    y = int(world_y // TILE_SIZE)
    px = min(TILE_SIZE - 1, max(0, int(world_x) - x * TILE_SIZE))
    py = min(TILE_SIZE - 1, max(0, int(world_y) - y * TILE_SIZE))
    return x, y, px, py


def fetch_terrain_tile(x, y):
    """Fetch a z14 terrain-rgb tile with thread-safe disk + memory caching.
    Returns a fully-decoded RGB image, or None on 404/failure. Concurrent fetches
    of the same tile are deduped via a per-tile lock; different tiles run in
    parallel."""
    key = (x, y)
    cached = terrain_cache.get(key, _MISSING)
    if cached is not _MISSING:
        return cached

    with _tile_lock(key):
        # Re-check now that we hold the lock — another worker may have filled it.
        cached = terrain_cache.get(key, _MISSING)
        if cached is not _MISSING:
            return cached

        cache_path = os.path.join(TILE_CACHE_DIR, f'{TERRAIN_ZOOM}_{x}_{y}.png')
        result = None
        if os.path.exists(cache_path):
            if os.path.getsize(cache_path) > 0:
                result = Image.open(cache_path).convert('RGB')
                result.load()  # decode now so cross-thread getpixel is safe
        else:
            url = (f'https://api.mapbox.com/v4/mapbox.terrain-rgb'
                   f'/{TERRAIN_ZOOM}/{x}/{y}.pngraw'
                   f'?access_token={_get_mapbox_token()}')
            resp = _session.get(url)
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            if resp.status_code == 404:
                _atomic_write(cache_path, b'')  # empty file marks a 404
            else:
                resp.raise_for_status()
                _atomic_write(cache_path, resp.content)
                result = Image.open(BytesIO(resp.content)).convert('RGB')
                result.load()

        terrain_cache[key] = result
        return result


def elevation_at(lng, lat):
    """Elevation in meters at a point, or None if the tile is unavailable."""
    x, y, px, py = lng_lat_to_tile_pixel(lng, lat, TERRAIN_ZOOM)
    img = fetch_terrain_tile(x, y)
    if img is None:
        return None
    r, g, b = img.getpixel((px, py))[:3]
    return -10000 + (r * 65536 + g * 256 + b) * 0.1


# --- Elevation math (port of computeElevation, ride-stats.ts) ----------------

def smooth_altitudes(points):
    """Spike-reject (fast EMA) then centered moving average. `points` is a list
    of dicts with 'altitude' (float or None). Returns a list aligned to points,
    with NaN where altitude was None."""
    alts = [p['altitude'] for p in points]
    result = [float('nan')] * len(alts)

    raw_vals = []
    idxs = []
    for i, a in enumerate(alts):
        if a is not None:
            raw_vals.append(a)
            idxs.append(i)
    if not raw_vals:
        return result

    seed_count = min(5, len(raw_vals))
    seed_slice = sorted(raw_vals[:seed_count])
    spike_ema = seed_slice[len(seed_slice) // 2]
    vals = []
    for v in raw_vals:
        if abs(v - spike_ema) > ELEVATION_SPIKE_THRESHOLD:
            vals.append(spike_ema)
        else:
            vals.append(v)
        spike_ema = SPIKE_EMA_ALPHA * vals[-1] + (1 - SPIKE_EMA_ALPHA) * spike_ema

    for i in range(len(vals)):
        lo = max(0, i - ELEVATION_SMOOTH_HALF)
        hi = min(len(vals) - 1, i + ELEVATION_SMOOTH_HALF)
        result[idxs[i]] = sum(vals[lo:hi + 1]) / (hi - lo + 1)
    return result


def compute_elevation(points):
    """Dead-band gain/loss with a horizontal-distance anchor (port). `points`:
    list of dicts with 'lng', 'lat', 'altitude'."""
    smoothed = smooth_altitudes(points)
    gain = 0.0
    loss = 0.0
    min_e = float('inf')
    max_e = float('-inf')
    anchor = None
    dist_since_anchor = 0.0

    for i, alt in enumerate(smoothed):
        if math.isnan(alt):
            continue
        if alt < min_e:
            min_e = alt
        if alt > max_e:
            max_e = alt

        if anchor is not None and i > 0:
            dist_since_anchor += haversine_m(
                points[i - 1]['lng'], points[i - 1]['lat'],
                points[i]['lng'], points[i]['lat'])

        if anchor is None:
            anchor = alt
            continue

        if dist_since_anchor < ELEVATION_MIN_DISTANCE:
            continue

        delta = alt - anchor
        if delta > ELEVATION_DEAD_BAND:
            gain += delta
            anchor = alt
            dist_since_anchor = 0.0
        elif delta < -ELEVATION_DEAD_BAND:
            loss += abs(delta)
            anchor = alt
            dist_since_anchor = 0.0

    if min_e == float('inf'):
        min_e = 0.0
    if max_e == float('-inf'):
        max_e = 0.0
    return gain, loss, min_e, max_e


# --- Overpass ----------------------------------------------------------------

def build_overpass_query(s, w, n, e):
    """Bike-relevant ways in a (south, west, north, east) bbox, mirroring
    OSM_BIKE_TRAIL_FILTER: bicycle in yes/designated/permissive, OR (mtb:scale
    or highway=cycleway) and not bike-denied / access-restricted."""
    bbox = f'{s},{w},{n},{e}'
    return (
        '[out:json][timeout:120];'
        '('
        f'way["bicycle"~"^(yes|designated|permissive)$"]({bbox});'
        f'way["mtb:scale"]["bicycle"!~"^(no|private)$"]'
        f'["access"!~"^(no|private)$"]({bbox});'
        f'way["highway"="cycleway"]["bicycle"!~"^(no|private)$"]'
        f'["access"!~"^(no|private)$"]({bbox});'
        ');'
        'out geom;'
    )


def cell_key(region, s, w, n, e):
    return f'{region}_{s:.3f}_{w:.3f}_{n:.3f}_{e:.3f}'.replace('-', 'm')


def _overpass_request(overpass_url, query):
    """Run one Overpass query and return the parsed JSON dict. Routes through
    `ssh host curl` when OVERPASS_SSH_HOST is set, else a local HTTP POST. Raises
    on any failure (including a non-JSON rate-limit body) so the caller retries.
    The query travels over stdin in the SSH path, so its brackets/quotes never
    touch a shell."""
    if OVERPASS_SSH_HOST:
        remote = (
            f"curl -s -m 180 -A {shlex.quote(OVERPASS_HEADERS['User-Agent'])} "
            f"--data-urlencode data@- {shlex.quote(overpass_url)}"
        )
        proc = subprocess.run(
            ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
             OVERPASS_SSH_HOST, remote],
            input=query.encode(), stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=300)
        if proc.returncode != 0:
            raise RuntimeError(f'ssh/curl failed: {proc.stderr.decode()[:200]}')
        return json.loads(proc.stdout.decode())  # non-JSON (e.g. 429) -> retry

    resp = _session.post(overpass_url, data={'data': query},
                         headers=OVERPASS_HEADERS, timeout=180)
    if resp.status_code in (429, 504):
        raise RuntimeError(f'overpass HTTP {resp.status_code}')
    resp.raise_for_status()
    return resp.json()


def fetch_overpass_cell(region, s, w, n, e, overpass_url, polite_s):
    """Fetch one bbox cell of ways from Overpass, with disk caching + retries.
    Returns the parsed JSON 'elements' list (ways with inline geometry)."""
    cache_path = os.path.join(OVERPASS_CACHE_DIR,
                              cell_key(region, s, w, n, e) + '.json')
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            return json.load(f).get('elements', [])

    query = build_overpass_query(s, w, n, e)
    last_err = None
    for attempt in range(5):
        try:
            data = _overpass_request(overpass_url, query)
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            with open(cache_path, 'w') as f:
                json.dump(data, f)
            if polite_s:
                time.sleep(polite_s)
            return data.get('elements', [])
        except Exception as ex:  # noqa: BLE001 — network resilience
            last_err = ex
            time.sleep(3 * (attempt + 1))
    print(f'    WARNING: Overpass cell failed after retries: {last_err}')
    return []


def fetch_region_ways(region, bbox, cell_deg, overpass_url, polite_s,
                      overpass_workers):
    """Fetch every bike-relevant way in the region bbox, deduped by OSM id.
    Cells are fetched `overpass_workers` at a time (default 1 — Overpass bans
    aggressive concurrent clients); each cell caches to its own file, and the
    results are merged on the main thread."""
    min_lng, min_lat, max_lng, max_lat = bbox
    # Build the cell grid (Overpass bbox order is south, west, north, east).
    lats = _frange(min_lat, max_lat, cell_deg)
    lngs = _frange(min_lng, max_lng, cell_deg)
    cells = [(s, w, min(s + cell_deg, max_lat), min(w + cell_deg, max_lng))
             for s in lats for w in lngs]

    ways = {}
    done = 0
    with ThreadPoolExecutor(max_workers=overpass_workers) as pool:
        futures = {
            pool.submit(fetch_overpass_cell, region, s, w, n, e,
                        overpass_url, polite_s): (s, w)
            for (s, w, n, e) in cells
        }
        for future in as_completed(futures):
            done += 1
            s, w = futures[future]
            for el in future.result():
                if el.get('type') != 'way':
                    continue
                geom = el.get('geometry')
                if not geom or len(geom) < 2:
                    continue
                ways[el['id']] = [[g['lon'], g['lat']] for g in geom]
            print(f'  [cell {done}/{len(cells)}] {s:.2f},{w:.2f} '
                  f'({len(ways)} ways so far)')
    return ways


def _frange(start, stop, step):
    """Inclusive-ish float range: values from start up to (but not past) stop."""
    out = []
    v = start
    while v < stop:
        out.append(round(v, 6))
        v += step
    return out


# --- Per-way processing ------------------------------------------------------

def process_way(line):
    """Compute (lengthM, gain, loss, min, max) for one way's geometry, or None
    if no terrain could be sampled."""
    length = line_length_m(line)
    densified = densify_line(line)
    if len(densified) < 2:
        return None

    points = [{'lng': lng, 'lat': lat, 'altitude': elevation_at(lng, lat)}
              for lng, lat in densified]
    if not any(p['altitude'] is not None for p in points):
        return None

    gain, loss, min_e, max_e = compute_elevation(points)
    return [round(length), round(gain), round(loss), round(min_e), round(max_e)]


# --- Manifest ----------------------------------------------------------------

def update_manifest(region, name, bbox, count, file_name):
    """Upsert this region into index.json so the client knows which file to load
    for a clicked location. Accumulates across runs (one entry per region)."""
    regions = []
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as f:
            regions = json.load(f).get('regions', [])
    regions = [r for r in regions if r.get('region') != region]
    regions.append({
        'region': region,
        'name': name,
        'bbox': [round(v, 4) for v in bbox],
        'count': count,
        'file': file_name,
    })
    regions.sort(key=lambda r: r['region'])
    with open(MANIFEST_PATH, 'w') as f:
        json.dump({'regions': regions}, f, indent=2)


# --- Main --------------------------------------------------------------------

def process_region(region, name, bbox, cell_deg, overpass_url, polite_s,
                   workers, overpass_workers):
    print(f'\n=== {name} ({region}) bbox={bbox} ===')
    print('Fetching bike-relevant ways from Overpass...')
    ways = fetch_region_ways(region, bbox, cell_deg, overpass_url, polite_s,
                             overpass_workers)
    print(f'  {len(ways)} unique ways')

    trails = {}
    start = time.time()
    items = list(ways.items())
    done = 0
    # Per-way elevation sampling is I/O-bound on terrain-tile fetches, so run it
    # across the same worker pool. process_way is pure aside from the thread-safe
    # tile cache, and results are collected on the main thread.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process_way, line): osm_id
                   for osm_id, line in items}
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result is not None:
                trails[str(futures[future])] = result
            if done % 200 == 0 or done == len(items):
                elapsed = time.time() - start
                eta = (elapsed / done) * (len(items) - done)
                print(f'  [{done}/{len(items)}] {len(trails)} with elevation '
                      f'(terrain tiles: {len(terrain_cache)}) [ETA {eta:.0f}s]')

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    file_name = f'{region}.json'
    out_path = os.path.join(OUTPUT_DIR, file_name)
    with open(out_path, 'w') as f:
        json.dump({
            'region': region,
            'name': name,
            'bbox': [round(v, 6) for v in bbox],
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'count': len(trails),
            'trails': trails,
        }, f, separators=(',', ':'))

    update_manifest(region, name, bbox, len(trails), file_name)
    print(f'  Wrote {out_path} ({len(trails)} trails)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--region',
                       help='Region key (US state slug, "oregon", or "all")')
    group.add_argument('--bbox',
                       help='Custom bbox "minLng,minLat,maxLng,maxLat"')
    parser.add_argument('--region-name',
                       help='Region slug for --bbox output (required with --bbox)')
    parser.add_argument('--cell-deg', type=float, default=CELL_DEG_DEFAULT,
                       help=f'Overpass cell size in degrees (default {CELL_DEG_DEFAULT})')
    parser.add_argument('--overpass-url', default=OVERPASS_URL_DEFAULT,
                       help='Overpass API endpoint')
    parser.add_argument('--polite-sleep', type=float, default=3.0,
                       help='Seconds to sleep after each Overpass request, per '
                            'worker (default 3.0 — Overpass fair-use)')
    parser.add_argument('--workers', type=int, default=3,
                       help='Concurrent workers for terrain (Mapbox) sampling '
                            '(default 3 — Mapbox tolerates concurrency)')
    parser.add_argument('--overpass-workers', type=int, default=1,
                       help='Concurrent Overpass requests (default 1; '
                            'concurrency is what gets the client rate-limited)')
    parser.add_argument('--overpass-ssh',
                       help='Route Overpass through `ssh USER@HOST curl` (key '
                            'auth) when the local IP is blocked. Elevation still '
                            'samples Mapbox locally.')
    args = parser.parse_args()

    global OVERPASS_SSH_HOST
    OVERPASS_SSH_HOST = args.overpass_ssh

    if args.bbox:
        if not args.region_name:
            parser.error('--region-name is required with --bbox')
        parts = [float(x) for x in args.bbox.split(',')]
        if len(parts) != 4:
            parser.error('--bbox must be minLng,minLat,maxLng,maxLat')
        targets = [(args.region_name, args.region_name.replace('-', ' ').title(),
                    tuple(parts))]
    elif args.region == 'all':
        targets = [(slug, slug.replace('-', ' ').title(), box)
                   for slug, box in US_STATE_BBOX.items()]
    else:
        slug = args.region.lower()
        if slug not in US_STATE_BBOX:
            parser.error(f'Unknown region "{slug}". Known: '
                         f'{", ".join(sorted(US_STATE_BBOX))}, or use --bbox.')
        targets = [(slug, slug.replace('-', ' ').title(), US_STATE_BBOX[slug])]

    for region, name, bbox in targets:
        process_region(region, name, bbox, args.cell_deg,
                       args.overpass_url, args.polite_sleep, args.workers,
                       args.overpass_workers)


if __name__ == '__main__':
    main()
