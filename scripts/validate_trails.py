"""
Validate trail geometry by detecting routing issues in MVT tile data.

Checks for:
  - Disconnected segments (gaps between chained segments)
  - Segments that needed reversal to chain (potential direction issues)
  - Segments that couldn't connect at all (missing geometry)
  - Elevation anomalies (sudden jumps in the profile data)

Usage: python scripts/validate_trails.py [trail_name]
  With no arguments, validates all trails and prints a summary.
  With a trail name, prints detailed diagnostics for that trail.

Requires: pip install Pillow requests
"""

import gzip, json, math, os, re, struct, sys

# Reuse the MVT decoder and tile fetching from add_trail_elevation.py
# Import by adding the scripts dir to path
sys.path.insert(0, os.path.dirname(__file__))
from add_trail_elevation import (
    extract_all_trails,
    deduplicate_segments,
    haversine_ft,
    get_known_trails,
    TRAIL_BBOX,
    MVT_ZOOM,
)

GAP_THRESHOLD_FT = 200  # Flag gaps larger than this
ELEV_JUMP_THRESHOLD_FT = 50  # Flag elevation jumps larger than this


def dist_deg(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def analyze_segments(trail_name, raw_segments):
    """Analyze trail segments and report issues."""
    segments = deduplicate_segments(raw_segments)
    issues = []

    if not segments:
        issues.append(('error', 'No geometry found'))
        return issues, segments, []

    if len(segments) == 1:
        return issues, segments, [{'segments': [0], 'gaps': []}]

    # Try chaining with detailed tracking
    TOLERANCE = 0.0003  # ~100ft in degrees

    remaining = list(range(len(segments)))
    remaining.sort(key=lambda i: len(segments[i]), reverse=True)

    chains = []
    current_chain = {
        'segments': [remaining.pop(0)],
        'gaps': [],
        'reversals': [],
    }

    while remaining:
        chain_seg = segments[current_chain['segments'][-1]]
        if current_chain.get('_reversed_segs'):
            # Use the last actual segment data
            chain_end = current_chain['_last_end']
        else:
            chain_end = chain_seg[-1]

        best_idx = None
        best_dist = float('inf')
        best_reverse = False
        best_end = 'start'  # which end of the candidate matched

        for idx in remaining:
            seg = segments[idx]
            # Check all 4 combinations: chain_end->seg_start, chain_end->seg_end
            d_start = dist_deg(chain_end, seg[0])
            d_end = dist_deg(chain_end, seg[-1])

            if d_start < best_dist:
                best_dist = d_start
                best_idx = idx
                best_reverse = False
                best_end = 'start'
            if d_end < best_dist:
                best_dist = d_end
                best_idx = idx
                best_reverse = True
                best_end = 'end'

        seg = segments[best_idx]
        remaining.remove(best_idx)

        gap_ft = haversine_ft(chain_end[0], chain_end[1],
                              seg[0][0] if not best_reverse else seg[-1][0],
                              seg[0][1] if not best_reverse else seg[-1][1])

        if best_reverse:
            current_chain['reversals'].append({
                'segment_idx': best_idx,
                'points': len(seg),
                'matched_end': best_end,
                'gap_ft': round(gap_ft),
            })

        if best_dist <= TOLERANCE:
            # Close enough to merge
            current_chain['segments'].append(best_idx)
            actual_seg = list(reversed(seg)) if best_reverse else seg
            current_chain['_last_end'] = actual_seg[-1]
            current_chain['_reversed_segs'] = True
        else:
            # Gap too large
            current_chain['gaps'].append({
                'after_segment': current_chain['segments'][-1],
                'to_segment': best_idx,
                'gap_ft': round(gap_ft),
                'reversed': best_reverse,
                'from_coord': chain_end,
                'to_coord': seg[0] if not best_reverse else seg[-1],
            })
            current_chain['segments'].append(best_idx)
            actual_seg = list(reversed(seg)) if best_reverse else seg
            current_chain['_last_end'] = actual_seg[-1]
            current_chain['_reversed_segs'] = True

    chains.append(current_chain)

    # Report issues
    for chain in chains:
        for gap in chain['gaps']:
            if gap['gap_ft'] >= GAP_THRESHOLD_FT:
                issues.append(('gap', (
                    f"Gap of {gap['gap_ft']}ft between segments "
                    f"{gap['after_segment']} and {gap['to_segment']}"
                    f"{' (reversed)' if gap['reversed'] else ''}"
                )))
        for rev in chain['reversals']:
            issues.append(('reversal', (
                f"Segment {rev['segment_idx']} ({rev['points']} pts) "
                f"was reversed to chain (gap {rev['gap_ft']}ft)"
            )))

    # Check if segments could connect better with different ordering
    # Try: does the chain start connect to any disconnected segment end?
    if len(segments) > 1:
        all_endpoints = []
        for i, seg in enumerate(segments):
            all_endpoints.append((i, 'start', seg[0]))
            all_endpoints.append((i, 'end', seg[-1]))

        # Check for near-misses: endpoints that are close but not within tolerance
        for i in range(len(all_endpoints)):
            for j in range(i + 1, len(all_endpoints)):
                ei = all_endpoints[i]
                ej = all_endpoints[j]
                if ei[0] == ej[0]:
                    continue  # same segment
                d = dist_deg(ei[2], ej[2])
                gap = haversine_ft(ei[2][0], ei[2][1], ej[2][0], ej[2][1])
                # Flag cases where two end-points or two start-points are close
                # (suggesting one segment is reversed)
                if gap < GAP_THRESHOLD_FT and ei[1] == ej[1]:
                    issues.append(('direction', (
                        f"Segments {ei[0]} and {ej[0]} have matching "
                        f"{ei[1]} endpoints {gap:.0f}ft apart "
                        f"(one is likely reversed in the tileset)"
                    )))

    return issues, segments, chains


def check_elevation_profile(trail_name):
    """Check a trail's elevation profile for anomalies."""
    slug = trail_name.lower().replace("'", '').replace('/', '-').replace('&', '-')
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')

    path = os.path.join('public/data/elevation', f'{slug}.json')
    if not os.path.exists(path):
        return []

    with open(path) as f:
        data = json.load(f)

    issues = []
    pts = data['profile']

    for i in range(1, len(pts)):
        delta = pts[i][1] - pts[i - 1][1]
        if abs(delta) >= ELEV_JUMP_THRESHOLD_FT:
            gap = haversine_ft(pts[i - 1][2], pts[i - 1][3],
                               pts[i][2], pts[i][3])
            issues.append(('elev_jump', (
                f"Elevation jump of {delta:+d}ft at "
                f"{pts[i][0] / 5280:.2f}mi "
                f"({pts[i-1][1]}ft -> {pts[i][1]}ft, "
                f"coord gap {gap:.0f}ft)"
            )))

    return issues


def print_segment_detail(segments):
    """Print detailed segment info."""
    for i, seg in enumerate(segments):
        length = sum(
            haversine_ft(seg[j][0], seg[j][1], seg[j+1][0], seg[j+1][1])
            for j in range(len(seg) - 1)
        )
        print(f"  Segment {i}: {len(seg)} pts, {length:.0f}ft "
              f"({length/5280:.2f}mi)")
        print(f"    Start: ({seg[0][0]:.6f}, {seg[0][1]:.6f})")
        print(f"    End:   ({seg[-1][0]:.6f}, {seg[-1][1]:.6f})")

        # Show distance between this segment's endpoints and other segments
        for j, other in enumerate(segments):
            if i == j:
                continue
            d_ss = haversine_ft(seg[0][0], seg[0][1], other[0][0], other[0][1])
            d_se = haversine_ft(seg[0][0], seg[0][1], other[-1][0], other[-1][1])
            d_es = haversine_ft(seg[-1][0], seg[-1][1], other[0][0], other[0][1])
            d_ee = haversine_ft(seg[-1][0], seg[-1][1], other[-1][0], other[-1][1])
            best = min(d_ss, d_se, d_es, d_ee)
            connections = []
            if d_es < GAP_THRESHOLD_FT:
                connections.append(f"end->start[{j}]: {d_es:.0f}ft")
            if d_ee < GAP_THRESHOLD_FT:
                connections.append(f"end->end[{j}]: {d_ee:.0f}ft")
            if d_ss < GAP_THRESHOLD_FT:
                connections.append(f"start->start[{j}]: {d_ss:.0f}ft")
            if d_se < GAP_THRESHOLD_FT:
                connections.append(f"start->end[{j}]: {d_se:.0f}ft")
            if connections:
                print(f"    Near seg {j}: {', '.join(connections)}")
            elif best < 2000:
                print(f"    Far from seg {j}: closest {best:.0f}ft")


def main():
    single_trail = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else None

    print("Fetching trail geometries from vector tiles...")
    all_trails = extract_all_trails(MVT_ZOOM, TRAIL_BBOX)

    # Also try z14 for missing trails
    known = get_known_trails()
    missing = set(known.keys()) - set(all_trails.keys())
    if missing:
        from add_trail_elevation import extract_all_trails as extract
        for name in list(missing):
            bounds = known.get(name)
            if not bounds:
                continue
            expanded = (bounds[0] - 0.005, bounds[1] - 0.005,
                        bounds[2] + 0.005, bounds[3] + 0.005)
            trail_data = extract(14, expanded)
            if name in trail_data:
                all_trails[name] = trail_data[name]

    if single_trail:
        # Detailed report for one trail
        if single_trail not in all_trails:
            print(f"Trail '{single_trail}' not found in tileset")
            sys.exit(1)

        raw = all_trails[single_trail]
        issues, segments, chains = analyze_segments(single_trail, raw)
        elev_issues = check_elevation_profile(single_trail)

        print(f"\n=== {single_trail} ===")
        print(f"Raw segments from tileset: {len(raw)}")
        print(f"After dedup: {len(segments)}")
        print()

        print_segment_detail(segments)

        if issues or elev_issues:
            print(f"\nIssues ({len(issues) + len(elev_issues)}):")
            for severity, msg in issues + elev_issues:
                icon = {'error': 'X', 'gap': 'G', 'reversal': 'R',
                        'direction': 'D', 'elev_jump': 'E'}.get(severity, '?')
                print(f"  [{icon}] {msg}")
        else:
            print("\nNo issues found.")
        return

    # Validate all trails
    print(f"\nValidating {len(all_trails)} trails...\n")

    trails_with_issues = []
    total_issues = 0

    for name in sorted(all_trails.keys()):
        raw = all_trails[name]
        issues, segments, chains = analyze_segments(name, raw)
        elev_issues = check_elevation_profile(name)

        # Filter to significant issues only
        significant = [i for i in issues if i[0] in ('gap', 'direction', 'error')]
        significant += [i for i in elev_issues if i[0] == 'elev_jump']

        if significant:
            trails_with_issues.append((name, significant))
            total_issues += len(significant)

    if trails_with_issues:
        print(f"Found {total_issues} issues in {len(trails_with_issues)} trails:\n")
        for name, issues in trails_with_issues:
            print(f"  {name}:")
            for severity, msg in issues:
                icon = {'error': 'X', 'gap': 'G', 'direction': 'D',
                        'elev_jump': 'E'}.get(severity, '?')
                print(f"    [{icon}] {msg}")
            print()
    else:
        print("No issues found.")

    print(f"Validated {len(all_trails)} trails, "
          f"{len(trails_with_issues)} with issues")


if __name__ == '__main__':
    main()
