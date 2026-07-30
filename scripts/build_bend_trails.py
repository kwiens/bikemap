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
  - public/data/bend/trails.geojson                  — exact rendered geometry

We measure from OSM, not from bendbikerides' path (their geometry is only a
fingerprint for matching). The generated GeoJSON and elevation profiles share
the exact same ordered OSM-derived segments; `osmIds` remain as provenance.

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
GEOJSON_OUT = os.path.join(ROOT, "public", "data", "bend", "trails.geojson")

M_TO_FT = 3.280839895
M_TO_MI = 1 / 1609.344
PROFILE_GAP_THRESHOLD_FT = 50.0
TRACE_MIN_WAY_SHARE = 0.001
TRACE_MIN_COVERAGE = 0.90
TRACE_TOLERANCE_M = 35.0
TRACE_WAY_JOIN_TOLERANCE_M = 3.0
TRACE_WAY_SWITCH_MAX_M = SAMPLE_STEP_M * 3

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


def profile_points_to_geometry(
    profile: list[list[float]],
    gap_details: list[dict],
) -> list[list[list[float]]]:
    """Split profile coordinates at known source-segment boundaries."""
    if not profile:
        return []
    boundaries = {
        (tuple(detail["from"]), tuple(detail["to"]))
        for detail in gap_details
        if detail.get("from") and detail.get("to")
    }
    current = [[profile[0][2], profile[0][3]]]
    segments = []
    for left, right in zip(profile, profile[1:]):
        left_coord = [left[2], left[3]]
        right_coord = [right[2], right[3]]
        if (tuple(left_coord), tuple(right_coord)) in boundaries:
            if len(current) >= 2:
                segments.append(current)
            current = [right_coord]
        elif right_coord != current[-1]:
            current.append(right_coord)
    if len(current) >= 2:
        segments.append(current)
    return segments


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

    def connected_way_switch(
        previous_id: int,
        next_id: int,
        previous_point: list[float],
        next_point: list[float],
    ) -> bool:
        """Return whether a way switch follows a shared endpoint junction."""
        previous = candidate_ways[previous_id]
        next_geometry = candidate_ways[next_id]
        for previous_end in (previous[0], previous[-1]):
            for next_end in (next_geometry[0], next_geometry[-1]):
                if haversine_m(*previous_end, *next_end) > TRACE_WAY_JOIN_TOLERANCE_M:
                    continue
                distance_via_join = (
                    haversine_m(*previous_point, *previous_end)
                    + haversine_m(*next_end, *next_point)
                )
                if distance_via_join <= TRACE_WAY_SWITCH_MAX_M:
                    return True
        return False

    for reference in reference_segments:
        if len(reference) < 2:
            continue
        samples = densify_line([list(point) for point in reference], SAMPLE_STEP_M)
        current = []
        current_way_id = None
        for sample in samples:
            total += 1
            px, py = project(sample)
            best_distance_sq = tolerance_sq
            best_point = None
            best_way_id = None
            for osm_id, geometry in projected_ways.items():
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
                        best_way_id = osm_id

            if best_point is None:
                if len(current) >= 2:
                    traced_segments.append(current)
                current = []
                current_way_id = None
                continue

            matched += 1
            snapped_lnglat = unproject(best_point)
            if (
                current
                and current_way_id is not None
                and best_way_id != current_way_id
                and not connected_way_switch(
                    current_way_id,
                    best_way_id,
                    current[-1],
                    snapped_lnglat,
                )
            ):
                if len(current) >= 2:
                    traced_segments.append(current)
                current = []
            if not current or haversine_m(*current[-1], *snapped_lnglat) > 0.1:
                current.append(snapped_lnglat)
            current_way_id = best_way_id

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
        "geometry": profile_points_to_geometry(profile, gap_details),
    }


def existing_profile_fallback(slug: str) -> dict | None:
    """Keep a last-known profile when its curated OSM source disappeared."""
    path = os.path.join(ELEV_DIR, f"{slug}.json")
    try:
        with open(path, encoding="utf-8") as fh:
            existing = json.load(fh)
    except (OSError, ValueError):
        return None
    profile = existing.get("profile", [])
    gap_details = existing.get("geometryGapDetails", [])
    geometry = profile_points_to_geometry(profile, gap_details)
    if not profile or not geometry:
        return None
    lngs = [point[2] for point in profile]
    lats = [point[3] for point in profile]
    distance_ft = existing.get("distance", profile[-1][0])
    return {
        "distance_mi": round(distance_ft / 5280, 2),
        "gain_ft": existing.get("gain", 0),
        "loss_ft": existing.get("loss", 0),
        "min_ft": existing.get("min", 0),
        "max_ft": existing.get("max", 0),
        "bounds": [min(lngs), min(lats), max(lngs), max(lats)],
        "profile": profile,
        "distance_ft": distance_ft,
        "geometry_coverage": 0.0,
        "geometry_gaps_ft": [detail["feet"] for detail in gap_details],
        "geometry_gap_details": gap_details,
        "geometry_source": "existing-profile-fallback",
        "geometry": geometry,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-cover", type=float, default=0.55)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument(
        "--geojson-only",
        action="store_true",
        help="rebuild rendered geometry from existing elevation profiles",
    )
    args = ap.parse_args()

    with open(JSONL, encoding="utf-8") as fh:
        meta = {json.loads(l)["slug"]: json.loads(l) for l in fh}

    selected = []
    with open(MATCH_CSV, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["geom_status"] in ("strong", "good") and r["osm_ids"] and \
                    float(r["covered_frac"]) >= args.min_cover:
                selected.append(r)
    print(f"{len(selected)} trails selected (strong/good, cover>={args.min_cover})")

    if args.geojson_only:
        write_geojson_from_profiles(selected)
        print(f"Wrote {len(selected)} trail geometries -> {GEOJSON_OUT}")
        return

    print("Loading OSM ways ...")
    ways = load_ways()
    if not ways:
        raise RuntimeError(
            f"no OSM ways found at {CACHE_GLOB}; refusing to overwrite generated data"
        )
    match_ways, match_grid = load_match_ways()

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
            built = existing_profile_fallback(r["slug"])
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

    # Keep the source slug as the public asset/deep-link identifier. Display
    # names are not stable URL keys (parentheses, punctuation, and even the
    # occasional upstream typo make name-derived slugs differ from the route).
    seen_slugs, seen_names, trails = set(), set(), []
    for t in sorted(results, key=lambda t: (t["recArea"], t["display"])):
        name = t["display"]
        if name in seen_names:
            name = f"{t['display']} ({t['recArea']})"
        seen_names.add(name)
        slug = t["slug"]
        if slug in seen_slugs:
            raise ValueError(f"duplicate Bend source slug: {slug}")
        seen_slugs.add(slug)
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
        output_path = os.path.join(ELEV_DIR, f"{t['slug_out']}.json")
        legacy_path = os.path.join(ELEV_DIR, f"{slugify(t['trailName'])}.json")
        if legacy_path != output_path and os.path.exists(legacy_path):
            try:
                with open(legacy_path, encoding="utf-8") as fh:
                    legacy_profile = json.load(fh)
            except (OSError, ValueError):
                legacy_profile = {}
            if legacy_profile.get("trail") == t["trailName"]:
                os.unlink(legacy_path)
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(prof, fh, separators=(",", ":"))

    write_data_ts(trails)
    write_geojson(trails)
    print(f"\nWrote {len(trails)} trails -> {DATA_TS}")
    print(f"Wrote {len(trails)} trail geometries -> {GEOJSON_OUT}")
    print(f"Wrote {len(trails)} elevation profiles -> {ELEV_DIR}/")
    fallback_slugs = [
        trail["slug_out"]
        for trail in trails
        if trail["geometry_source"] == "existing-profile-fallback"
    ]
    if fallback_slugs:
        print(
            "WARNING: retained last-known geometry without a current OSM source: "
            + ", ".join(fallback_slugs)
        )
    skipped = len(selected) - len(trails)
    if skipped:
        print(f"({skipped} selected trails produced no geometry/profile)")


def write_data_ts(trails: list[dict]) -> None:
    def quote(s: str) -> str:
        escaped = s.replace("\\", "\\\\")
        if "'" in escaped:
            return f'"{escaped.replace(chr(34), chr(92) + chr(34))}"'
        return f"'{escaped}'"

    def number_array(prop: str, values: list[int]) -> list[str]:
        joined = ", ".join(str(value) for value in values)
        single_line = f"    {prop}: [{joined}],"
        if len(single_line) <= 80:
            return [single_line]
        lines = [f"    {prop}: ["]
        current = "      "
        for value in values:
            token = f"{value},"
            candidate = f"{current}{' ' if current.strip() else ''}{token}"
            if len(candidate) > 80 and current.strip():
                lines.append(current)
                current = f"      {token}"
            else:
                current = candidate
        if current.strip():
            lines.append(current)
        lines.append("    ],")
        return lines

    lines = [
        "import { faMountain } from '@fortawesome/free-solid-svg-icons';",
        "import type { MountainBikeTrail } from '@/data/mountain-bike-trails';",
        "",
        "// Generated by scripts/build_bend_trails.py from OSM geometry. Do not",
        "// edit by hand — rerun the script. Trails render from the generated",
        "// Bend GeoJSON; osmIds retain the source-way provenance.",
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
            f"    slug: {quote(t['slug_out'])},",
            f"    trailName: {quote(t['trailName'])},",
            f"    displayName: {quote(t['display'])},",
            f"    recArea: {quote(t['recArea'])},",
            f"    rating: '{rating}',",
            f"    color: trailColor('{rating}'),",
            f"    distance: {t['distance_mi']},",
            f"    elevationGain: {t['gain_ft']},",
            f"    elevationLoss: {t['loss_ft']},",
            f"    elevationMin: {t['min_ft']},",
            f"    elevationMax: {t['max_ft']},",
            f"    defaultBounds: [{', '.join(str(x) for x in t['bounds'])}],",
            *number_array("osmIds", t["ids"]),
            "    icon: faMountain,",
            "  },",
        ]
    lines += ["];", ""]
    with open(DATA_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def write_geojson(trails: list[dict]) -> None:
    features = [
        {
            "type": "Feature",
            "properties": {
                "Trail": trail["trailName"],
                "slug": trail["slug_out"],
                "osmIds": trail["ids"],
            },
            "geometry": {
                "type": "MultiLineString",
                "coordinates": trail["geometry"],
            },
        }
        for trail in trails
    ]
    os.makedirs(os.path.dirname(GEOJSON_OUT), exist_ok=True)
    with open(GEOJSON_OUT, "w", encoding="utf-8") as fh:
        json.dump(
            {"type": "FeatureCollection", "features": features},
            fh,
            separators=(",", ":"),
        )


def write_geojson_from_profiles(rows: list[dict[str, str]]) -> None:
    trails = []
    for row in rows:
        slug = row["slug"]
        path = os.path.join(ELEV_DIR, f"{slug}.json")
        with open(path, encoding="utf-8") as fh:
            profile = json.load(fh)
        gap_details = profile.get("geometryGapDetails", [])
        geometry = profile_points_to_geometry(profile.get("profile", []), gap_details)
        if not geometry:
            raise RuntimeError(f"profile has no renderable geometry: {slug}")
        trails.append(
            {
                "trailName": profile["trail"],
                "slug_out": slug,
                "ids": [int(value) for value in row["osm_ids"].split(";") if value],
                "geometry": geometry,
            }
        )
    write_geojson(trails)


if __name__ == "__main__":
    main()
