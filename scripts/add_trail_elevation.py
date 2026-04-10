"""
Compute granular elevation profiles for all SORBA trails.

Fetches trail geometry directly from Mapbox Vector Tiles and samples elevation
from Terrain-RGB tiles. No browser extraction needed.

Output:
  - public/data/elevation/{slug}.json  — per-trail elevation profiles
  - src/data/geo_data.ts               — summary stats (gain, loss, min, max)

Usage: python scripts/add_trail_elevation.py
Requires: pip install Pillow requests
"""

import gzip, json, math, os, re, struct, sys, time
from io import BytesIO
from PIL import Image
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Session with automatic retries for transient failures
_session = requests.Session()
_session.mount('https://', HTTPAdapter(
    max_retries=Retry(total=5, backoff_factor=0.5,
                      status_forcelist=[429, 500, 502, 503, 504])))

# --- Constants ---

def _read_mapbox_token():
    """Read the Mapbox access token from map.config.ts."""
    config_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'config', 'map.config.ts')
    with open(config_path) as f:
        content = f.read()
    match = re.search(r"accessToken:\s*['\"](.+?)['\"]", content)
    if not match:
        print("Error: Could not find accessToken in src/config/map.config.ts")
        sys.exit(1)
    return match.group(1)

MAPBOX_TOKEN = _read_mapbox_token()
MVT_TILESET = 'swuller.ccfw1cmr'
TRAIL_BBOX = (-85.48, 34.76, -84.85, 35.21)
MVT_ZOOM = 12
TERRAIN_ZOOM = 15
TILE_SIZE = 256
SAMPLE_STEP_FT = 25
METERS_TO_FEET = 3.28084
EARTH_RADIUS_FT = 20902231.0
OUTPUT_DIR = 'public/data/elevation'
GEO_DATA_PATH = 'src/data/mountain-bike-trails.ts'
TILE_CACHE_DIR = 'scripts/.tile_cache'

# --- Caches ---

mvt_cache = {}
terrain_cache = {}


# ============================================================
# Pure Python MVT (Protobuf) Decoder
# ============================================================

def decode_varint(data, pos):
    """Decode a protobuf varint. Returns (value, new_pos)."""
    result = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if (b & 0x80) == 0:
            return result, pos
        shift += 7
    return result, pos


def zigzag_decode(n):
    """Decode zigzag-encoded signed integer."""
    return (n >> 1) ^ -(n & 1)


def parse_pbf(data):
    """Parse protobuf bytes into {field_number: [values]}."""
    fields = {}
    pos = 0
    while pos < len(data):
        tag, pos = decode_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x7
        if wire_type == 0:  # varint
            val, pos = decode_varint(data, pos)
        elif wire_type == 2:  # length-delimited
            length, pos = decode_varint(data, pos)
            val = data[pos:pos + length]
            pos += length
        elif wire_type == 5:  # 32-bit
            val = data[pos:pos + 4]
            pos += 4
        elif wire_type == 1:  # 64-bit
            val = data[pos:pos + 8]
            pos += 8
        else:
            break
        fields.setdefault(field_num, []).append(val)
    return fields


def decode_packed_uints(data):
    """Decode packed repeated uint32 from bytes."""
    values = []
    pos = 0
    while pos < len(data):
        val, pos = decode_varint(data, pos)
        values.append(val)
    return values


def decode_pbf_value(raw):
    """Decode a protobuf Value message into a Python value."""
    v = parse_pbf(raw)
    if 1 in v:
        return v[1][0].decode('utf-8')
    if 2 in v:
        return struct.unpack('<f', v[2][0])[0]
    if 3 in v:
        return struct.unpack('<d', v[3][0])[0]
    if 4 in v:
        return v[4][0]
    if 5 in v:
        return v[5][0]
    if 6 in v:
        return zigzag_decode(v[6][0])
    if 7 in v:
        return bool(v[7][0])
    return None


def tile_to_lnglat(tx, ty, tile_x, tile_y, zoom, extent=4096):
    """Convert MVT tile-local coordinates to lng/lat."""
    n = 2 ** zoom
    lng = (tile_x + tx / extent) / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(
        math.pi * (1 - 2 * (tile_y + ty / extent) / n))))
    return [lng, lat]


def decode_geometry(geom_ints, tile_x, tile_y, zoom, extent=4096):
    """Decode MVT geometry commands into list of [[lng,lat], ...] linestrings."""
    lines = []
    current = []
    cx, cy = 0, 0
    i = 0
    while i < len(geom_ints):
        cmd_int = geom_ints[i]
        cmd = cmd_int & 0x7
        count = cmd_int >> 3
        i += 1
        if cmd == 1:  # MoveTo
            for _ in range(count):
                cx += zigzag_decode(geom_ints[i])
                cy += zigzag_decode(geom_ints[i + 1])
                i += 2
                if current and len(current) > 1:
                    lines.append(current)
                current = [tile_to_lnglat(cx, cy, tile_x, tile_y, zoom, extent)]
        elif cmd == 2:  # LineTo
            for _ in range(count):
                cx += zigzag_decode(geom_ints[i])
                cy += zigzag_decode(geom_ints[i + 1])
                i += 2
                current.append(tile_to_lnglat(cx, cy, tile_x, tile_y, zoom, extent))
        elif cmd == 7:  # ClosePath
            pass
    if current and len(current) > 1:
        lines.append(current)
    return lines


def decode_mvt_tile(raw_bytes, tile_x, tile_y, zoom):
    """Decode a (possibly gzipped) MVT tile. Returns {trail_name: [segments]}."""
    try:
        data = gzip.decompress(raw_bytes)
    except (gzip.BadGzipFile, OSError):
        data = raw_bytes

    tile = parse_pbf(data)
    trails = {}

    for layer_data in tile.get(3, []):
        layer = parse_pbf(layer_data)
        keys = [k.decode('utf-8') for k in layer.get(3, [])]
        values = [decode_pbf_value(rv) for rv in layer.get(4, [])]
        extent = layer.get(5, [4096])[0]
        if isinstance(extent, bytes):
            extent = 4096

        for feat_data in layer.get(2, []):
            feat = parse_pbf(feat_data)
            geom_type = feat.get(3, [0])[0]
            if geom_type != 2:  # Only LineStrings
                continue

            # Decode tags
            tags_raw = feat.get(2, [b''])[0]
            tags = decode_packed_uints(tags_raw) if isinstance(tags_raw, bytes) and tags_raw else []
            props = {}
            for j in range(0, len(tags) - 1, 2):
                ki, vi = tags[j], tags[j + 1]
                if ki < len(keys) and vi < len(values):
                    props[keys[ki]] = values[vi]

            trail_name = props.get('Trail', '')
            if not trail_name:
                continue

            # Decode geometry
            geom_raw = feat.get(4, [b''])[0]
            geom_ints = decode_packed_uints(geom_raw) if isinstance(geom_raw, bytes) else []
            lines = decode_geometry(geom_ints, tile_x, tile_y, zoom, extent)

            if trail_name not in trails:
                trails[trail_name] = []
            trails[trail_name].extend(lines)

    return trails


# ============================================================
# Tile Fetching
# ============================================================

def lng_lat_to_tile(lng, lat, zoom):
    """Convert lng/lat to tile x, y."""
    n = 2 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad))
             / math.pi) / 2.0 * n)
    return x, y


def tiles_covering_bbox(bbox, zoom):
    """Return list of (x, y) tile coords covering a bounding box."""
    min_lng, min_lat, max_lng, max_lat = bbox
    x_min, y_max = lng_lat_to_tile(min_lng, min_lat, zoom)
    x_max, y_min = lng_lat_to_tile(max_lng, max_lat, zoom)
    tiles = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            tiles.append((x, y))
    return tiles


def fetch_mvt(z, x, y):
    """Fetch an MVT tile with local disk + memory caching."""
    key = (z, x, y)
    if key in mvt_cache:
        return mvt_cache[key]

    # Check disk cache
    cache_path = os.path.join(TILE_CACHE_DIR, 'mvt', f'{z}_{x}_{y}.mvt')
    if os.path.exists(cache_path):
        with open(cache_path, 'rb') as f:
            data = f.read()
        if len(data) == 0:
            mvt_cache[key] = None
            return None
        mvt_cache[key] = data
        return data

    # Fetch from API
    url = (f'https://api.mapbox.com/v4/{MVT_TILESET}'
           f'/{z}/{x}/{y}.mvt?access_token={MAPBOX_TOKEN}')
    resp = _session.get(url)

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    if resp.status_code == 404:
        with open(cache_path, 'wb') as f:
            pass  # empty file marks 404
        mvt_cache[key] = None
        return None

    resp.raise_for_status()
    with open(cache_path, 'wb') as f:
        f.write(resp.content)
    mvt_cache[key] = resp.content
    return resp.content


def fetch_terrain_tile(tile_x, tile_y):
    """Fetch a terrain-rgb tile with local disk + memory caching."""
    key = (tile_x, tile_y)
    if key in terrain_cache:
        return terrain_cache[key]

    # Check disk cache
    cache_path = os.path.join(
        TILE_CACHE_DIR, 'terrain', f'{TERRAIN_ZOOM}_{tile_x}_{tile_y}.png')
    if os.path.exists(cache_path):
        img = Image.open(cache_path)
        terrain_cache[key] = img
        return img

    # Fetch from API
    url = (f'https://api.mapbox.com/v4/mapbox.terrain-rgb'
           f'/{TERRAIN_ZOOM}/{tile_x}/{tile_y}.pngraw'
           f'?access_token={MAPBOX_TOKEN}')
    resp = _session.get(url)
    resp.raise_for_status()

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, 'wb') as f:
        f.write(resp.content)

    img = Image.open(BytesIO(resp.content))
    terrain_cache[key] = img
    return img


# ============================================================
# Elevation Sampling
# ============================================================

def get_elevation_ft(lng, lat):
    """Get elevation in feet for a point using z15 terrain-rgb."""
    tx, ty = lng_lat_to_tile(lng, lat, TERRAIN_ZOOM)
    n = 2 ** TERRAIN_ZOOM
    tile_lng_min = tx / n * 360.0 - 180.0
    tile_lng_max = (tx + 1) / n * 360.0 - 180.0
    tile_lat_max = math.degrees(math.atan(math.sinh(
        math.pi * (1 - 2 * ty / n))))
    tile_lat_min = math.degrees(math.atan(math.sinh(
        math.pi * (1 - 2 * (ty + 1) / n))))

    px = min(max(int((lng - tile_lng_min) /
                     (tile_lng_max - tile_lng_min) * TILE_SIZE), 0), TILE_SIZE - 1)
    py = min(max(int((tile_lat_max - lat) /
                     (tile_lat_max - tile_lat_min) * TILE_SIZE), 0), TILE_SIZE - 1)

    img = fetch_terrain_tile(tx, ty)
    r, g, b = img.getpixel((px, py))[:3]
    elev_m = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
    return round(elev_m * METERS_TO_FEET)


# ============================================================
# Geometry Processing
# ============================================================

def haversine_ft(lng1, lat1, lng2, lat2):
    """Great-circle distance in feet between two points."""
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return EARTH_RADIUS_FT * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def deduplicate_segments(segments):
    """Remove duplicate segments using midpoint matching."""
    seen = set()
    result = []
    for seg in segments:
        if len(seg) < 2:
            continue
        mid_idx = len(seg) // 2
        mid = (round(seg[mid_idx][0], 5), round(seg[mid_idx][1], 5))
        if mid in seen:
            continue
        seen.add(mid)
        result.append(seg)
    return result


def chain_segments(segments):
    """Order segments into a continuous chain by matching endpoints.

    Checks all four endpoint combinations for each candidate segment:
      chain tail  -> seg start  (append as-is)
      chain tail  -> seg end    (append reversed)
      chain head  -> seg end    (prepend as-is)
      chain head  -> seg start  (prepend reversed)

    This handles reversed segments in the tileset where two segments
    share start-start or end-end endpoints.
    """
    if len(segments) <= 1:
        return segments

    TOLERANCE = 0.0003  # ~100ft in degrees

    def dist_deg(a, b):
        return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

    # Start with the longest segment
    remaining = list(range(len(segments)))
    remaining.sort(key=lambda i: len(segments[i]), reverse=True)

    # Build a single merged polyline
    chain = list(segments[remaining.pop(0)])

    while remaining:
        chain_head = chain[0]
        chain_tail = chain[-1]

        best_idx = None
        best_dist = float('inf')
        # action: 'append' or 'prepend', reverse: whether to flip the segment
        best_action = 'append'
        best_reverse = False

        for idx in remaining:
            seg = segments[idx]

            # Append to tail: tail -> seg start
            d = dist_deg(chain_tail, seg[0])
            if d < best_dist:
                best_dist, best_idx = d, idx
                best_action, best_reverse = 'append', False

            # Append to tail (reversed): tail -> seg end
            d = dist_deg(chain_tail, seg[-1])
            if d < best_dist:
                best_dist, best_idx = d, idx
                best_action, best_reverse = 'append', True

            # Prepend to head: head -> seg end
            d = dist_deg(chain_head, seg[-1])
            if d < best_dist:
                best_dist, best_idx = d, idx
                best_action, best_reverse = 'prepend', False

            # Prepend to head (reversed): head -> seg start
            d = dist_deg(chain_head, seg[0])
            if d < best_dist:
                best_dist, best_idx = d, idx
                best_action, best_reverse = 'prepend', True

        seg = segments[best_idx]
        remaining.remove(best_idx)

        if best_reverse:
            seg = list(reversed(seg))

        if best_dist <= TOLERANCE:
            if best_action == 'append':
                chain.extend(seg)
            else:
                chain = seg + chain
        else:
            # Gap too large — append anyway (profile will show the jump)
            if best_action == 'prepend':
                chain = seg + chain
            else:
                chain.extend(seg)

    return [chain]


def interpolate_along_line(coords, step_ft):
    """Walk a polyline and return evenly-spaced (lng, lat) points."""
    if len(coords) < 2:
        return coords

    points = [coords[0]]
    remaining = step_ft

    for i in range(len(coords) - 1):
        ax, ay = coords[i][0], coords[i][1]
        bx, by = coords[i + 1][0], coords[i + 1][1]
        seg_len = haversine_ft(ax, ay, bx, by)

        if seg_len < 0.1:
            continue

        cursor = 0.0
        while cursor + remaining <= seg_len:
            cursor += remaining
            frac = cursor / seg_len
            px = ax + frac * (bx - ax)
            py = ay + frac * (by - ay)
            points.append([px, py])
            remaining = step_ft

        remaining -= (seg_len - cursor)

    # Always include the final point
    last = coords[-1]
    if points[-1] != last:
        points.append(last)

    return points


# ============================================================
# Trail Geometry Extraction
# ============================================================

def extract_all_trails(zoom, bbox):
    """Fetch MVT tiles and extract all trail geometries."""
    tiles = tiles_covering_bbox(bbox, zoom)
    all_trails = {}
    fetched = 0

    for x, y in tiles:
        raw = fetch_mvt(zoom, x, y)
        fetched += 1
        if raw is None:
            continue
        tile_trails = decode_mvt_tile(raw, x, y, zoom)
        for name, segs in tile_trails.items():
            if name not in all_trails:
                all_trails[name] = []
            all_trails[name].extend(segs)

    print(f"  Fetched {fetched} tiles at z{zoom}, found {len(all_trails)} trails")
    return all_trails


def get_known_trails():
    """Extract trail names and defaultBounds from geo_data.ts."""
    with open(GEO_DATA_PATH) as f:
        content = f.read()

    trails = {}
    # Match each trail entry's trailName and defaultBounds
    pattern = r"trailName:\s*['\"](.+?)['\"]"
    bounds_pattern = r"trailName:\s*['\"](.+?)['\"].*?defaultBounds:\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]"

    for m in re.finditer(pattern, content):
        trails[m.group(1)] = None

    for m in re.finditer(bounds_pattern, content, flags=re.DOTALL):
        name = m.group(1)
        bounds = (float(m.group(2)), float(m.group(3)),
                  float(m.group(4)), float(m.group(5)))
        trails[name] = bounds

    return trails


# ============================================================
# Profile Generation
# ============================================================

def generate_profile(trail_name, segments):
    """Generate a full elevation profile for a trail."""
    deduped = deduplicate_segments(segments)
    chained = chain_segments(deduped)

    profile = []
    cumulative = 0.0
    gain = 0
    loss = 0
    min_elev = float('inf')
    max_elev = float('-inf')
    prev_elev = None
    prev_coord = None

    for seg in chained:
        points = interpolate_along_line(seg, SAMPLE_STEP_FT)
        for pt in points:
            lng, lat = pt[0], pt[1]
            elev = get_elevation_ft(lng, lat)

            if prev_coord is not None:
                dist = haversine_ft(prev_coord[0], prev_coord[1], lng, lat)
                cumulative += dist

            profile.append([round(cumulative), elev, round(lng, 6), round(lat, 6)])
            min_elev = min(min_elev, elev)
            max_elev = max(max_elev, elev)

            if prev_elev is not None:
                delta = elev - prev_elev
                if delta > 0:
                    gain += delta
                else:
                    loss += abs(delta)

            prev_elev = elev
            prev_coord = [lng, lat]

    return {
        'trail': trail_name,
        'distance': round(cumulative),
        'gain': gain,
        'loss': loss,
        'min': min_elev if min_elev != float('inf') else 0,
        'max': max_elev if max_elev != float('-inf') else 0,
        'profile': profile,
    }


def slugify(name):
    """Convert trail name to URL-safe filename slug."""
    s = name.lower()
    s = re.sub(r"['\"]", '', s)
    s = re.sub(r'[/&]', '-', s)
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')


# ============================================================
# geo_data.ts Updater
# ============================================================

def update_geo_data(trail_data):
    """Update geo_data.ts with distance and elevation summary stats.

    Uses a line-by-line approach to avoid regex crossing trail boundaries.
    """
    with open(GEO_DATA_PATH) as f:
        lines = f.readlines()

    updated = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        # Find trailName lines
        m = re.match(r"(\s*)trailName:\s*['\"](.+?)['\"],", line)
        if not m:
            i += 1
            continue

        indent = m.group(1)
        trail_name = m.group(2)
        if trail_name not in trail_data:
            i += 1
            continue

        data = trail_data[trail_name]
        dist_mi = round(data['distance'] / 5280, 1)
        gain = data['gain']
        loss = data['loss']
        elev_min = data['min']
        elev_max = data['max']

        # Find the end of this trail entry (closing brace)
        entry_end = i + 1
        while entry_end < len(lines) and not lines[entry_end].strip().startswith('},'):
            entry_end += 1

        # Remove any existing distance/elevation lines within this entry
        entry_lines = []
        for j in range(i, entry_end):
            stripped = lines[j].strip()
            if any(stripped.startswith(f) for f in [
                'distance:', 'elevationGain:', 'elevationLoss:',
                'elevationMin:', 'elevationMax:',
            ]):
                continue
            entry_lines.append(lines[j])

        # Find where to insert (before defaultBounds or icon line)
        insert_idx = len(entry_lines)
        for j, el in enumerate(entry_lines):
            stripped = el.strip()
            if stripped.startswith('defaultBounds:') or stripped.startswith('icon:'):
                insert_idx = j
                break

        new_lines = [
            f"{indent}distance: {dist_mi},\n",
            f"{indent}elevationGain: {gain}, elevationLoss: {loss}, "
            f"elevationMin: {elev_min}, elevationMax: {elev_max},\n",
        ]
        entry_lines[insert_idx:insert_idx] = new_lines

        # Replace the original lines
        lines[i:entry_end] = entry_lines
        updated += 1
        i += len(entry_lines) + 1

    with open(GEO_DATA_PATH, 'w') as f:
        f.writelines(lines)

    return updated


# ============================================================
# Main
# ============================================================

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--trail', help='Process only the named trail')
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Step 1: Extract trail geometries from MVT tiles
    print("Fetching trail geometries from vector tiles...")
    all_trails = extract_all_trails(MVT_ZOOM, TRAIL_BBOX)

    # Filter to single trail if requested
    if args.trail:
        if args.trail in all_trails:
            all_trails = {args.trail: all_trails[args.trail]}
        else:
            print(f"Trail '{args.trail}' not found in MVT tiles.")
            print(f"Available trails: {sorted(all_trails.keys())}")
            sys.exit(1)
    else:
        # Check for missing trails and retry at z14
        known = get_known_trails()
        found = set(all_trails.keys())
        missing = set(known.keys()) - found

        if missing:
            print(f"\n{len(missing)} trails not found at z{MVT_ZOOM}, retrying at z14...")
            for name in list(missing):
                bounds = known.get(name)
                if not bounds:
                    continue
                # Expand bounds slightly for tile coverage
                expanded = (bounds[0] - 0.005, bounds[1] - 0.005,
                            bounds[2] + 0.005, bounds[3] + 0.005)
                trail_data = extract_all_trails(14, expanded)
                if name in trail_data:
                    all_trails[name] = trail_data[name]
                    missing.discard(name)
                    print(f"  Found {name} at z14")

        if missing:
            print(f"\n{len(missing)} trails still not found:")
            for name in sorted(missing):
                print(f"  - {name}")

    # Step 2: Generate elevation profiles
    print(f"\nGenerating elevation profiles for {len(all_trails)} trails...")
    trail_results = {}
    start_time = time.time()

    for i, (name, segments) in enumerate(sorted(all_trails.items())):
        profile = generate_profile(name, segments)
        trail_results[name] = profile

        # Write per-trail JSON
        slug = slugify(name)
        out_path = os.path.join(OUTPUT_DIR, f'{slug}.json')
        with open(out_path, 'w') as f:
            json.dump(profile, f, separators=(',', ':'))

        elapsed = time.time() - start_time
        eta = (elapsed / (i + 1)) * (len(all_trails) - i - 1) if i > 0 else 0
        print(f"[{i + 1}/{len(all_trails)}] {name}: "
              f"{profile['distance']}ft, "
              f"+{profile['gain']}/-{profile['loss']}ft, "
              f"range {profile['min']}-{profile['max']}ft "
              f"({len(profile['profile'])} pts) "
              f"[ETA {eta:.0f}s]")

    print(f"\nDone! {len(trail_results)} profiles in {time.time() - start_time:.1f}s")
    print(f"Terrain tiles: {len(terrain_cache)}, MVT tiles: {len(mvt_cache)}")

    # Step 3: Update mountain-bike-trails.ts
    print("\nUpdating mountain-bike-trails.ts...")
    updated = update_geo_data(trail_results)
    print(f"Updated {updated} trails in mountain-bike-trails.ts")


if __name__ == '__main__':
    main()
