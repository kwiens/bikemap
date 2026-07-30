#!/usr/bin/env python3
"""Build Bend's curated MTB dataset from OSM geometry.

Inputs (all produced earlier, offline):
  - data/bend-osm-match.csv      — curated trail -> OSM way ids (geometry aligner)
  - data/bend-bike-rides.jsonl   — curated metadata (name, complex, difficulty)
  - scripts/.osm_cache/oregon_*.json — OSM way geometry (Overpass)

For every trail matched strong/good, we take the OSM way(s) it rides on, order
them into a coherent line, sample Mapbox Terrain-RGB along them (reusing the
elevation port in osm_trail_elevation.py), and emit:

  - public/data/elevation/<slug>.json            — per-trail profile for the pane
  - src/data/cities/bend/mountain-bike-trails.data.ts — the curated array

We measure from OSM, not from bendbikerides' path (their geometry is only a
fingerprint for matching). Trails render by OSM_ID, so each entry carries the
matched `osmIds`.

  python scripts/build_bend_trails.py [--min-cover 0.55] [--workers 4]
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from _geo import slugify
from align_bend_geometry import (
    TOL_M,
    decode_path,
    load_ways as load_match_ways,
    match_trail,
)

# Reuse the elevation port + terrain sampling so Bend numbers match the client.
from osm_trail_elevation import (
    SAMPLE_STEP_M,
    compute_elevation,
    densify_line,
    elevation_at,
    haversine_m,
    line_length_m,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE_GLOB = os.environ.get(
    "BEND_OSM_CACHE_GLOB",
    os.path.join(HERE, ".osm_cache", "oregon_*.json"),
)
MATCH_CSV = os.path.join(ROOT, "data", "bend-osm-match.csv")
JSONL = os.path.join(ROOT, "data", "bend-bike-rides.jsonl")
ELEV_DIR = os.path.join(ROOT, "public", "data", "elevation")
DATA_TS = os.path.join(ROOT, "src", "data", "cities", "bend", "mountain-bike-trails.data.ts")

M_TO_FT = 3.280839895
M_TO_MI = 1 / 1609.344
PROFILE_GAP_THRESHOLD_FT = 50.0
TRACE_MIN_WAY_SHARE = 0.001
TRACE_MIN_COVERAGE = 0.90
TRACE_TOLERANCE_M = 35.0

# bendbikerides difficulty -> our rating; pick the hardest across segments.
DIFF_RATING = {"green": "easy", "blue": "intermediate", "black": "advanced",
               "double-black": "expert"}
DIFF_RANK = {"green": 0, "blue": 1, "black": 2, "double-black": 3}


def clean_name(name: str) -> str:
    """Normalize typographic apostrophes to straight; collapse whitespace."""
    return re.sub(r"\s+", " ", (name or "").replace("’", "'").replace("‘", "'")).strip()


def rating_for(difficulty: str) -> str:
    toks = [t.strip().strip('"') for t in (difficulty or "").split(",") if t.strip()]
    toks = [t for t in toks if t in DIFF_RANK]
    if not toks:
        return ""
    hardest = max(toks, key=lambda t: DIFF_RANK[t])
    return DIFF_RATING[hardest]


def load_ways() -> dict[int, list[list[float]]]:
    ways: dict[int, list[list[float]]] = {}
    for f in glob.glob(CACHE_GLOB):
        try:
            with open(f, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as e:
            print(f"  WARN: skipping unreadable cache shard {os.path.basename(f)}: {e}")
            continue
        for el in data.get("elements", []):
            if el.get("type") != "way" or el.get("id") in ways:
                continue
            geom = el.get("geometry") or []
            if len(geom) >= 2:
                ways[el["id"]] = [[p["lon"], p["lat"]] for p in geom]
    return ways


def order_segments(geoms: list[list[list[float]]]) -> list[list[list[float]]]:
    """Order and orient segments using either end of the growing chain.

    Starting from the longest way is stable, but that way may begin at the
    middle of the trail. Consider both the head and tail when attaching each
    remaining way so shared-start/shared-end ways do not create a teleport in
    the generated elevation profile. Segments stay separate so a genuine gap
    is still visible to the audit rather than becoming phantom geometry.
    """
    geoms = [g for g in geoms if len(g) >= 2]
    if len(geoms) <= 1:
        return geoms
    used = [False] * len(geoms)
    start = max(range(len(geoms)), key=lambda i: line_length_m(geoms[i]))
    used[start] = True
    seq = [geoms[start]]
    for _ in range(len(geoms) - 1):
        head = seq[0][0]
        tail = seq[-1][-1]
        best = None  # (distance, index, action, reversed)
        for i, g in enumerate(geoms):
            if used[i]:
                continue
            candidates = (
                (haversine_m(*tail, *g[0]), "append", False),
                (haversine_m(*tail, *g[-1]), "append", True),
                (haversine_m(*head, *g[-1]), "prepend", False),
                (haversine_m(*head, *g[0]), "prepend", True),
            )
            for distance, action, reverse in candidates:
                if best is None or distance < best[0]:
                    best = (distance, i, action, reverse)
        _, i, action, reverse = best
        used[i] = True
        segment = geoms[i][::-1] if reverse else geoms[i]
        if action == "prepend":
            seq.insert(0, segment)
        else:
            seq.append(segment)
    return seq


def segment_gaps_ft(segments: list[list[list[float]]]) -> list[int]:
    return [detail["feet"] for detail in segment_gap_details(segments)]


def segment_gap_details(segments: list[list[list[float]]]) -> list[dict]:
    return [
        {
            "feet": round(haversine_m(*left[-1], *right[0]) * M_TO_FT),
            "from": [round(value, 6) for value in left[-1]],
            "to": [round(value, 6) for value in right[0]],
        }
        for left, right in zip(segments, segments[1:])
    ]


@dataclass
class TraceResult:
    segments: list[list[list[float]]]
    coverage: float
    gaps_ft: list[int]


def trace_reference_path(
    reference_segments: list[list[tuple[float, float]]],
    candidate_ids: list[int],
    ways: dict[int, list[list[float]]],
    tolerance_m: float = TOL_M,
) -> TraceResult:
    """Snap a reference fingerprint onto OSM geometry in reference order.

    Every returned coordinate lies on an OSM way. The external reference only
    selects and orders those coordinates; its geometry is never emitted. Runs
    with no OSM way inside the match tolerance remain separate and are surfaced
    as coverage/gap diagnostics in the generated profile.
    """
    reference_points = [point for segment in reference_segments for point in segment]
    candidate_ways = {
        osm_id: ways[osm_id]
        for osm_id in candidate_ids
        if osm_id in ways and len(ways[osm_id]) >= 2
    }
    if len(reference_points) < 2 or not candidate_ways:
        return TraceResult([], 0.0, [])

    lat0 = sum(point[1] for point in reference_points) / len(reference_points)
    lng0 = sum(point[0] for point in reference_points) / len(reference_points)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0

    def project(point):
        return ((point[0] - lng0) * kx, (point[1] - lat0) * ky)

    def unproject(point):
        return [point[0] / kx + lng0, point[1] / ky + lat0]

    projected_ways = {
        osm_id: [project(point) for point in geometry]
        for osm_id, geometry in candidate_ways.items()
    }
    tolerance_sq = tolerance_m * tolerance_m
    traced_segments = []
    matched = total = 0

    for reference in reference_segments:
        if len(reference) < 2:
            continue
        samples = densify_line([list(point) for point in reference], SAMPLE_STEP_M)
        current = []
        for sample in samples:
            total += 1
            px, py = project(sample)
            best_distance_sq = tolerance_sq
            best_point = None
            for geometry in projected_ways.values():
                for (ax, ay), (bx, by) in zip(geometry, geometry[1:]):
                    dx, dy = bx - ax, by - ay
                    denominator = dx * dx + dy * dy
                    fraction = 0.0 if denominator == 0 else (
                        ((px - ax) * dx + (py - ay) * dy) / denominator
                    )
                    fraction = max(0.0, min(1.0, fraction))
                    snapped = (ax + fraction * dx, ay + fraction * dy)
                    distance_sq = (px - snapped[0]) ** 2 + (py - snapped[1]) ** 2
                    if distance_sq < best_distance_sq:
                        best_distance_sq = distance_sq
                        best_point = snapped

            if best_point is None:
                if len(current) >= 2:
                    traced_segments.append(current)
                current = []
                continue

            matched += 1
            snapped_lnglat = unproject(best_point)
            if not current or haversine_m(*current[-1], *snapped_lnglat) > 0.1:
                current.append(snapped_lnglat)

        if len(current) >= 2:
            traced_segments.append(current)

    coverage = matched / total if total else 0.0
    return TraceResult(
        traced_segments,
        coverage,
        segment_gaps_ft(traced_segments),
    )


def better_trace(left: TraceResult | None, right: TraceResult) -> TraceResult:
    """Prefer adequate coverage, then the least unresolved geometry."""
    if left is None:
        return right
    left_adequate = left.coverage >= TRACE_MIN_COVERAGE
    right_adequate = right.coverage >= TRACE_MIN_COVERAGE
    if left_adequate != right_adequate:
        return left if left_adequate else right
    if not left_adequate:
        return left if left.coverage >= right.coverage else right

    def unresolved_feet(trace):
        return sum(gap for gap in trace.gaps_ft if gap >= PROFILE_GAP_THRESHOLD_FT)

    left_score = (unresolved_feet(left), -left.coverage)
    right_score = (unresolved_feet(right), -right.coverage)
    return left if left_score <= right_score else right


def build_trail(
    osm_ids: list[int],
    ways: dict,
    segments: list[list[list[float]]] | None = None,
    geometry_coverage: float = 1.0,
    geometry_source: str = "osm-ways",
) -> dict | None:
    geoms = [ways[i] for i in osm_ids if i in ways]
    if not geoms and not segments:
        return None
    seq = segments or order_segments(geoms)
    gap_details = segment_gap_details(seq)

    profile: list[list[float]] = []
    cum_m = 0.0
    gain = loss = 0.0
    min_e = math.inf
    max_e = -math.inf
    total_m = 0.0
    minx = miny = math.inf
    maxx = maxy = -math.inf
    last_ft = None
    previous_segment_end = None

    for seg in seq:
        if previous_segment_end is not None:
            gap_m = haversine_m(*previous_segment_end, *seg[0])
            total_m += gap_m
            cum_m += gap_m
        dense = densify_line(seg, SAMPLE_STEP_M)
        pts = [
            {"lng": lng, "lat": lat, "altitude": elevation_at(lng, lat)}
            for lng, lat in dense
        ]
        g, l, mn, mx = compute_elevation(pts)
        gain += g
        loss += l
        if mn != 0.0 or mx != 0.0:
            min_e = min(min_e, mn)
            max_e = max(max_e, mx)
        total_m += line_length_m(seg)
        # Geographic gaps advance the x-axis above; elevation gain/loss remains
        # segment-local so missing geometry cannot create a fictitious climb.
        prev = None
        for p in pts:
            if prev is not None:
                cum_m += haversine_m(prev["lng"], prev["lat"], p["lng"], p["lat"])
            prev = p
            alt = p["altitude"]
            ft = round(alt * M_TO_FT) if alt is not None else last_ft
            if ft is None:
                continue
            last_ft = ft
            lng, lat = p["lng"], p["lat"]
            minx, miny = min(minx, lng), min(miny, lat)
            maxx, maxy = max(maxx, lng), max(maxy, lat)
            profile.append([round(cum_m * M_TO_FT), ft, round(lng, 6), round(lat, 6)])
        previous_segment_end = seg[-1]

    if not profile:
        return None
    if min_e is math.inf:
        min_e = max_e = 0.0
    return {
        "distance_mi": round(total_m * M_TO_MI, 2),
        "gain_ft": round(gain * M_TO_FT),
        "loss_ft": round(loss * M_TO_FT),
        "min_ft": round(min_e * M_TO_FT),
        "max_ft": round(max_e * M_TO_FT),
        "bounds": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
        "profile": profile,
        "distance_ft": round(total_m * M_TO_FT),
        "geometry_coverage": round(geometry_coverage, 3),
        "geometry_gaps_ft": [detail["feet"] for detail in gap_details],
        "geometry_gap_details": gap_details,
        "geometry_source": geometry_source,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-cover", type=float, default=0.55)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    print("Loading OSM ways ...")
    ways = load_ways()
    match_ways, match_grid = load_match_ways()
    with open(JSONL, encoding="utf-8") as fh:
        meta = {json.loads(l)["slug"]: json.loads(l) for l in fh}

    selected = []
    with open(MATCH_CSV, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["geom_status"] in ("strong", "good") and r["osm_ids"] and \
                    float(r["covered_frac"]) >= args.min_cover:
                selected.append(r)
    print(f"{len(selected)} trails selected (strong/good, cover>={args.min_cover})")

    os.makedirs(ELEV_DIR, exist_ok=True)

    def work(r):
        ids = [int(x) for x in r["osm_ids"].split(";") if x]
        ordered = order_segments([ways[osm_id] for osm_id in ids if osm_id in ways])
        raw_gaps = segment_gaps_ft(ordered)
        trace = None
        if any(gap >= PROFILE_GAP_THRESHOLD_FT for gap in raw_gaps):
            m = meta.get(r["slug"], {})
            flag = None
            if m.get("flag_lng") is not None and m.get("flag_lat") is not None:
                flag = (m["flag_lng"], m["flag_lat"])
            reference = decode_path(m.get("path", ""), flag) if m.get("path") else []
            for tolerance_m in (TOL_M, TRACE_TOLERANCE_M):
                _, candidates = match_trail(
                    reference,
                    match_ways,
                    match_grid,
                    min_way_share=TRACE_MIN_WAY_SHARE,
                    tolerance_m=tolerance_m,
                )
                candidate_trace = trace_reference_path(
                    reference,
                    [osm_id for osm_id, _share in candidates],
                    ways,
                    tolerance_m=tolerance_m,
                )
                trace = better_trace(trace, candidate_trace)

        if trace and trace.coverage >= TRACE_MIN_COVERAGE and trace.segments:
            built = build_trail(
                ids,
                ways,
                segments=trace.segments,
                geometry_coverage=trace.coverage,
                geometry_source="osm-reference-snap",
            )
        else:
            built = build_trail(
                ids,
                ways,
                geometry_coverage=(
                    trace.coverage if trace else float(r["covered_frac"])
                ),
            )
        if not built:
            return None
        m = meta.get(r["slug"], {})
        display = clean_name(m.get("name") or r["name"])
        rec_area = clean_name(m.get("complex") or "") or "Bend Area"
        rating = rating_for(m.get("difficulty") or r["difficulty"])
        return {"slug": r["slug"], "display": display, "recArea": rec_area,
                "rating": rating, "ids": ids, **built}

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, out in enumerate(ex.map(work, selected)):
            if out:
                results.append(out)
            if (i + 1) % 25 == 0:
                print(f"  {i + 1}/{len(selected)}")

    # unique trailName/slug
    seen, trails = {}, []
    for t in sorted(results, key=lambda t: (t["recArea"], t["display"])):
        name = t["display"]
        slug = slugify(name)
        if slug in seen:
            name = f"{t['display']} ({t['recArea']})"
            slug = slugify(name)
        seen[slug] = True
        t["trailName"] = name
        t["slug_out"] = slug
        trails.append(t)

    # write per-trail elevation JSON
    for t in trails:
        prof = {
            "trail": t["trailName"],
            "distance": t["distance_ft"],
            "gain": t["gain_ft"],
            "loss": t["loss_ft"],
            "min": t["min_ft"],
            "max": t["max_ft"],
            "geometryCoverage": t["geometry_coverage"],
            "geometryGaps": t["geometry_gaps_ft"],
            "geometryGapDetails": t["geometry_gap_details"],
            "geometrySource": t["geometry_source"],
            "profile": t["profile"],
        }
        with open(
            os.path.join(ELEV_DIR, f"{t['slug_out']}.json"), "w", encoding="utf-8"
        ) as fh:
            json.dump(prof, fh, separators=(",", ":"))

    write_data_ts(trails)
    print(f"\nWrote {len(trails)} trails -> {DATA_TS}")
    print(f"Wrote {len(trails)} elevation profiles -> {ELEV_DIR}/")
    skipped = len(selected) - len(trails)
    if skipped:
        print(f"({skipped} selected trails produced no geometry/profile)")


def write_data_ts(trails: list[dict]) -> None:
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("'", "\\'")

    lines = [
        "import { faMountain } from '@fortawesome/free-solid-svg-icons';",
        "import type { MountainBikeTrail } from '@/data/mountain-bike-trails';",
        "",
        "// Generated by scripts/build_bend_trails.py from OSM geometry. Do not",
        "// edit by hand — rerun the script. Trails render by OSM_ID (osmIds);",
        "// length + elevation are sampled from Mapbox Terrain-RGB.",
        "",
        "const TRAIL_COLOR_EASY = '#16A34A';",
        "const TRAIL_COLOR_INTERMEDIATE = '#2563EB';",
        "const TRAIL_COLOR_ADVANCED = '#374151';",
        "const TRAIL_COLOR_EXPERT = '#000000';",
        "const TRAIL_COLOR_UNRATED = '#6B7280';",
        "",
        "function trailColor(rating: string): string {",
        "  if (rating === 'easy') return TRAIL_COLOR_EASY;",
        "  if (rating === 'intermediate') return TRAIL_COLOR_INTERMEDIATE;",
        "  if (rating === 'advanced') return TRAIL_COLOR_ADVANCED;",
        "  if (rating === 'expert') return TRAIL_COLOR_EXPERT;",
        "  return TRAIL_COLOR_UNRATED;",
        "}",
        "",
        "export const bendMountainBikeTrails: MountainBikeTrail[] = [",
    ]
    for t in trails:
        rating = t["rating"]
        lines += [
            "  {",
            f"    trailName: '{esc(t['trailName'])}',",
            f"    displayName: '{esc(t['display'])}',",
            f"    recArea: '{esc(t['recArea'])}',",
            f"    rating: '{rating}',",
            f"    color: trailColor('{rating}'),",
            f"    distance: {t['distance_mi']},",
            f"    elevationGain: {t['gain_ft']},",
            f"    elevationLoss: {t['loss_ft']},",
            f"    elevationMin: {t['min_ft']},",
            f"    elevationMax: {t['max_ft']},",
            f"    defaultBounds: [{', '.join(str(x) for x in t['bounds'])}],",
            f"    osmIds: [{', '.join(str(x) for x in t['ids'])}],",
            "    icon: faMountain,",
            "  },",
        ]
    lines += ["];", ""]
    with open(DATA_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    main()
