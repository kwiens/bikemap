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
from concurrent.futures import ThreadPoolExecutor

from _geo import slugify

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
CACHE_GLOB = os.path.join(HERE, ".osm_cache", "oregon_*.json")
MATCH_CSV = os.path.join(ROOT, "data", "bend-osm-match.csv")
JSONL = os.path.join(ROOT, "data", "bend-bike-rides.jsonl")
ELEV_DIR = os.path.join(ROOT, "public", "data", "elevation")
DATA_TS = os.path.join(ROOT, "src", "data", "cities", "bend", "mountain-bike-trails.data.ts")

M_TO_FT = 3.280839895
M_TO_MI = 1 / 1609.344

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
    """Greedy nearest-endpoint chain so the profile reads along the trail.
    Segments stay separate (no phantom geometry bridges gaps)."""
    geoms = [g for g in geoms if len(g) >= 2]
    if len(geoms) <= 1:
        return geoms
    used = [False] * len(geoms)
    start = max(range(len(geoms)), key=lambda i: line_length_m(geoms[i]))
    used[start] = True
    seq = [geoms[start]]
    for _ in range(len(geoms) - 1):
        tx, ty = seq[-1][-1]
        best = None  # (dist, idx, reversed)
        for i, g in enumerate(geoms):
            if used[i]:
                continue
            d0 = haversine_m(tx, ty, g[0][0], g[0][1])
            d1 = haversine_m(tx, ty, g[-1][0], g[-1][1])
            d, rev = (d0, False) if d0 <= d1 else (d1, True)
            if best is None or d < best[0]:
                best = (d, i, rev)
        _, i, rev = best
        used[i] = True
        seq.append(geoms[i][::-1] if rev else geoms[i])
    return seq


def build_trail(osm_ids: list[int], ways: dict) -> dict | None:
    geoms = [ways[i] for i in osm_ids if i in ways]
    if not geoms:
        return None
    seq = order_segments(geoms)

    profile: list[list[float]] = []
    cum_m = 0.0
    gain = loss = 0.0
    min_e = math.inf
    max_e = -math.inf
    total_m = 0.0
    minx = miny = math.inf
    maxx = maxy = -math.inf
    last_ft = None

    for seg in seq:
        dense = densify_line(seg, SAMPLE_STEP_M)
        pts = [{"lng": lng, "lat": lat, "altitude": elevation_at(lng, lat)}
               for lng, lat in dense]
        g, l, mn, mx = compute_elevation(pts)
        gain += g
        loss += l
        if mn != 0.0 or mx != 0.0:
            min_e = min(min_e, mn)
            max_e = max(max_e, mx)
        total_m += line_length_m(seg)
        # profile points, distance accumulating within-segment only
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
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-cover", type=float, default=0.55)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    print("Loading OSM ways ...")
    ways = load_ways()
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
        built = build_trail(ids, ways)
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
        prof = {"trail": t["trailName"], "distance": t["distance_ft"],
                "gain": t["gain_ft"], "loss": t["loss_ft"],
                "min": t["min_ft"], "max": t["max_ft"], "profile": t["profile"]}
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
