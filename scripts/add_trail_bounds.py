"""
Update trail defaultBounds and distance in geo_data.ts from Mapbox feature coordinates.

Usage:
  1. Open the map in Chrome with the SORBA layer visible
  2. Run this in the browser console to extract trail coordinates:

     const map = document.querySelector('canvas').closest('.mapboxgl-map').__mapbox_map;
     const features = map.querySourceFeatures('composite', { sourceLayer: 'SORBA_Regional_Trails-1oj4dx' });
     const trails = {};
     for (const f of features) {
       const name = f.properties.Trail;
       if (!name) continue;
       if (!trails[name]) trails[name] = [];
       const coords = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
       for (const ring of coords) trails[name].push(ring);
     }
     copy(JSON.stringify(trails));

  3. Paste the JSON into the trail_coords_json variable below
  4. Run: python scripts/add_trail_bounds.py
"""

import json, math, re, sys

# Paste trail coordinate data here (from browser console)
# Format: { "Trail Name": [[[lng, lat], [lng, lat], ...], ...], ... }
trail_coords_json = '''{}'''

def haversine_miles(lon1, lat1, lon2, lat2):
    """Calculate distance between two points in miles using haversine formula."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def line_distance_miles(coords):
    """Sum haversine distance along a list of [lng, lat] coordinate pairs."""
    total = 0.0
    for i in range(len(coords) - 1):
        total += haversine_miles(coords[i][0], coords[i][1],
                                 coords[i + 1][0], coords[i + 1][1])
    return total

def compute_trail_data(segments):
    """Compute bounds and total distance from a list of coordinate segments.

    Segments may overlap when Mapbox returns duplicate tile features, so we
    deduplicate by rounding coordinates and skipping segments whose midpoint
    is already covered.
    """
    all_coords = []
    seen_midpoints = set()
    deduped_segments = []

    for seg in segments:
        if len(seg) < 2:
            continue
        mid_idx = len(seg) // 2
        mid = (round(seg[mid_idx][0], 5), round(seg[mid_idx][1], 5))
        if mid in seen_midpoints:
            continue
        seen_midpoints.add(mid)
        deduped_segments.append(seg)
        all_coords.extend(seg)

    if not all_coords:
        return None, None

    lngs = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]
    bounds = [min(lngs), min(lats), max(lngs), max(lats)]

    total_distance = sum(line_distance_miles(seg) for seg in deduped_segments)
    # Round to 1 decimal place
    total_distance = round(total_distance, 1)

    return bounds, total_distance

# --- Main ---

trail_coords = json.loads(trail_coords_json)

if not trail_coords:
    print("No trail coordinate data found. Paste coordinates into trail_coords_json.")
    sys.exit(1)

# Compute bounds and distances
trail_data = {}
for name, segments in trail_coords.items():
    bounds, distance = compute_trail_data(segments)
    if bounds:
        trail_data[name] = {'bounds': bounds, 'distance': distance}

print(f"Computed data for {len(trail_data)} trails")

# Read the geo_data.ts file
with open('src/data/geo_data.ts', 'r') as f:
    content = f.read()

updated_bounds = 0
updated_distances = 0

for trail_name, data in trail_data.items():
    escaped = re.escape(trail_name)
    b = data['bounds']
    dist = data['distance']
    bounds_str = f'[{b[0]}, {b[1]}, {b[2]}, {b[3]}]'

    # Update or add defaultBounds
    # First try to replace existing defaultBounds
    bounds_pattern = f"(trailName: ['\"]({escaped})['\"],.*?)defaultBounds: \\[.*?\\]"
    if re.search(bounds_pattern, content, flags=re.DOTALL):
        content = re.sub(
            bounds_pattern,
            lambda m: f"{m.group(1)}defaultBounds: {bounds_str}",
            content, flags=re.DOTALL
        )
        updated_bounds += 1
    else:
        # Add defaultBounds before the icon line
        add_pattern = f"(trailName: ['\"]({escaped})['\"],.*?)(icon: fa(?:Mountain|Route))"
        def add_bounds(match):
            return f"{match.group(1)}defaultBounds: {bounds_str}, {match.group(3)}"
        new_content = re.sub(add_pattern, add_bounds, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            updated_bounds += 1

    # Update or add distance
    dist_pattern = f"(trailName: ['\"]({escaped})['\"],.*?)distance: [\\d.]+,"
    if re.search(dist_pattern, content, flags=re.DOTALL):
        content = re.sub(
            dist_pattern,
            lambda m: f"{m.group(1)}distance: {dist},",
            content, flags=re.DOTALL
        )
        updated_distances += 1
    else:
        # Add distance before defaultBounds
        add_dist_pattern = f"(trailName: ['\"]({escaped})['\"],.*?)(defaultBounds:)"
        def add_distance(match):
            return f"{match.group(1)}distance: {dist}, {match.group(3)}"
        new_content = re.sub(add_dist_pattern, add_distance, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            updated_distances += 1

with open('src/data/geo_data.ts', 'w') as f:
    f.write(content)

print(f"Updated {updated_bounds} bounds, {updated_distances} distances")
