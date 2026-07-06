#!/usr/bin/env python3
"""Geometry-align the bendbikerides curated trails to OSM ways.

Name + single-point matching (match_bend_trails_osm.py) is a coarse first pass.
This does the real work: it decodes each curated trail's full polyline (used
only as a *reference fingerprint* — we do not ship their geometry) and
map-matches it against the OSM ways cached for Oregon, assigning each sampled
trail point to its nearest OSM way within a tolerance. The result per trail is:

  * covered_frac  — fraction of the trail that lies on top of some OSM way
                    (the geometric match confidence)
  * osm_ids       — the OSM way(s) the trail actually rides on, ordered by how
                    much of the trail each carries (the geometry to render)
  * a name cross-check against those ways

Because matching is geometric, it disambiguates same-name trails, validates the
name matches, and recovers ways that are unnamed in OSM (e.g. Madras) which the
name pass could never find.

Read-only; runs offline against scripts/.osm_cache/oregon_*.json.

Output: data/bend-osm-match.csv (enriched, replaces the name-only table).
"""

from __future__ import annotations

import csv
import glob
import json
import math
import os
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE_GLOB = os.path.join(HERE, ".osm_cache", "oregon_*.json")
JSONL_IN = os.path.join(ROOT, "data", "bend-bike-rides.jsonl")
CSV_OUT = os.path.join(ROOT, "data", "bend-osm-match.csv")

BEND_LAT, BEND_LNG = 44.0582, -121.3153

TOL_M = 25.0           # a trail point within this of an OSM way counts as "on" it
RESAMPLE_M = 8.0       # resample trail polylines to this spacing before matching
MIN_WAY_SHARE = 0.06   # an OSM way must carry >=6% of the trail to be kept
GRID_DEG = 0.02        # ~2km spatial buckets for candidate lookup

STRONG, GOOD, WEAK = 0.80, 0.55, 0.30  # covered_frac thresholds

# --- flexible-polyline decode (HERE format, as emitted by bendbikerides) ------

_FP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
_FP_DEC = {c: i for i, c in enumerate(_FP_ALPHABET)}


def _decode_varints(s: str) -> list[int]:
    out, shift, val = [], 0, 0
    for ch in s:
        v = _FP_DEC[ch]
        val |= (v & 0x1F) << shift
        if v & 0x20:
            shift += 5
        else:
            out.append(val)
            val, shift = 0, 0
    return out


def _unzig(n: int) -> int:
    return (n >> 1) ^ -(n & 1)


def _decode_segment(s: str) -> list[tuple[float, float]]:
    """Decode one flexible-polyline piece to raw (a, b) pairs, axis order as
    stored (not yet resolved to lng/lat — see _orient)."""
    nums = _decode_varints(s)
    i = 0
    _ver = nums[i]; i += 1
    meta = nums[i]; i += 1
    prec = meta & 0x0F
    third = (meta >> 4) & 0x07
    factor = 10 ** prec
    step = 3 if third else 2
    a = b = 0
    raw: list[tuple[float, float]] = []
    while i + 1 < len(nums):
        a += _unzig(nums[i])
        b += _unzig(nums[i + 1])
        raw.append((a / factor, b / factor))
        i += step
    return raw


def _orient(segments, flag):
    """Resolve raw (a, b) pairs to (lng, lat). The bendbikerides encoder stores
    (lng, lat), which is the reverse of the HERE spec, so we don't trust either
    convention blindly: pick the axis order whose centroid lands closest to the
    trail's authoritative scraped flag point. Falls back to a lat-range check
    when no flag is available."""
    pts = [p for seg in segments for p in seg]
    if not pts:
        return segments
    am = sum(p[0] for p in pts) / len(pts)
    bm = sum(p[1] for p in pts) / len(pts)
    if flag is not None:
        flng, flat = flag
        d_as_lnglat = (am - flng) ** 2 + (bm - flat) ** 2   # (a,b) = (lng,lat)
        d_as_latlng = (bm - flng) ** 2 + (am - flat) ** 2   # (a,b) = (lat,lng)
        swap = d_as_latlng < d_as_lnglat
    else:
        swap = not (abs(am) > 90 >= abs(bm))  # if a looks like a latitude, swap
    if swap:
        return [[(b, a) for a, b in seg] for seg in segments]
    return [[(a, b) for a, b in seg] for seg in segments]


def decode_path(s, flag=None):
    """Decode to a list of (lng,lat) segments. Multi-segment trails join their
    flexible-polyline pieces with commas. `flag` is (lng, lat) used to resolve
    the axis order unambiguously."""
    raw = [seg for piece in s.split(",") if piece
           for seg in (_decode_segment(piece),) if len(seg) >= 2]
    return _orient(raw, flag)


# --- name normalization (for cross-check only) --------------------------------

_DROP = {"trail", "trails", "the"}
_NUM = re.compile(r"^#?\d+([.\-]\d+)?$")


def norm_tokens(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()
    return {t for t in re.sub(r"[^a-z0-9]+", " ", s).split()
            if t not in _DROP and not _NUM.match(t) and t != "no"}


def name_sim(a: str, b: str) -> float:
    ta, tb = norm_tokens(a), norm_tokens(b or "")
    if not ta or not tb:
        return 0.0
    inter = ta & tb
    contain = len(inter) / min(len(ta), len(tb))
    jacc = len(inter) / len(ta | tb)
    seq = SequenceMatcher(None, " ".join(sorted(ta)), " ".join(sorted(tb))).ratio()
    return max(seq, 0.6 * contain + 0.4 * jacc)


# --- local planar projection (meters) -----------------------------------------

def projector(lat0: float, lng0: float):
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    return lambda lng, lat: ((lng - lng0) * kx, (lat - lat0) * ky)


def resample(xy: list[tuple[float, float]], step: float) -> list[tuple[float, float]]:
    if len(xy) < 2:
        return xy
    out = [xy[0]]
    carry = 0.0
    for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        if seg == 0:
            continue
        d = carry
        while d < seg:
            t = d / seg
            out.append((x0 + t * (x1 - x0), y0 + t * (y1 - y0)))
            d += step
        carry = d - seg
    out.append(xy[-1])
    return out


def pt_seg_d2(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2


# --- OSM index ----------------------------------------------------------------

class Way:
    __slots__ = ("id", "name", "scale", "pts", "bbox")

    def __init__(self, wid, name, scale, pts):
        self.id = wid
        self.name = name
        self.scale = scale
        self.pts = pts  # list of (lng, lat)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))


def load_ways():
    ways: dict[int, Way] = {}
    grid: dict[tuple[int, int], set[int]] = defaultdict(set)
    for f in glob.glob(CACHE_GLOB):
        try:
            with open(f, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as e:
            print(f"  WARN: skipping unreadable cache shard {os.path.basename(f)}: {e}")
            continue
        for el in data.get("elements", []):
            if el.get("type") != "way":
                continue
            wid = el.get("id")
            if wid in ways:
                continue
            geom = el.get("geometry") or []
            if len(geom) < 2:
                continue
            pts = [(p["lon"], p["lat"]) for p in geom]
            tags = el.get("tags", {})
            w = Way(wid, tags.get("name"), tags.get("mtb:scale"), pts)
            ways[wid] = w
            x0, y0, x1, y1 = w.bbox
            for cx in range(int(x0 / GRID_DEG), int(x1 / GRID_DEG) + 1):
                for cy in range(int(y0 / GRID_DEG), int(y1 / GRID_DEG) + 1):
                    grid[(cx, cy)].add(wid)
    return ways, grid


def haversine_mi(a, b, c, d):
    R = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h)) * 0.621371


def candidate_ids(grid, bbox):
    x0, y0, x1, y1 = bbox
    out: set[int] = set()
    pad = GRID_DEG
    for cx in range(int((x0 - pad) / GRID_DEG), int((x1 + pad) / GRID_DEG) + 1):
        for cy in range(int((y0 - pad) / GRID_DEG), int((y1 + pad) / GRID_DEG) + 1):
            out |= grid.get((cx, cy), set())
    return out


def match_trail(segments, ways, grid):
    """Map-match (lng,lat) segments. Returns (covered_frac, [(way_id, share)])."""
    allpts = [p for seg in segments for p in seg]
    if len(allpts) < 2:
        return 0.0, []
    lat0 = sum(p[1] for p in allpts) / len(allpts)
    lng0 = sum(p[0] for p in allpts) / len(allpts)
    proj = projector(lat0, lng0)
    # Resample each segment independently so cross-segment gaps aren't bridged.
    samples = []
    for seg in segments:
        samples.extend(resample([proj(lng, lat) for lng, lat in seg], RESAMPLE_M))

    xs = [p[0] for p in allpts]; ys = [p[1] for p in allpts]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    cand = candidate_ids(grid, bbox)
    proj_ways = []  # (way_id, [seg endpoints in meters])
    for wid in cand:
        w = ways[wid]
        pw = [proj(lng, lat) for lng, lat in w.pts]
        proj_ways.append((wid, pw))

    tol2 = TOL_M ** 2
    counts: dict[int, int] = defaultdict(int)
    covered = 0
    for px, py in samples:
        best_d2 = tol2
        best_w = None
        for wid, pw in proj_ways:
            for (ax, ay), (bx, by) in zip(pw, pw[1:]):
                # cheap reject on x-range
                if px < min(ax, bx) - TOL_M or px > max(ax, bx) + TOL_M:
                    continue
                d2 = pt_seg_d2(px, py, ax, ay, bx, by)
                if d2 < best_d2:
                    best_d2 = d2
                    best_w = wid
        if best_w is not None:
            counts[best_w] += 1
            covered += 1
    n = len(samples)
    covered_frac = covered / n if n else 0.0
    kept = sorted(
        ((wid, c / n) for wid, c in counts.items() if c / n >= MIN_WAY_SHARE),
        key=lambda t: -t[1],
    )
    return covered_frac, kept


def classify(cf: float) -> str:
    if cf >= STRONG:
        return "strong"
    if cf >= GOOD:
        return "good"
    if cf >= WEAK:
        return "weak"
    return "none"


def main():
    print("Indexing OSM ways ...")
    ways, grid = load_ways()
    print(f"  {len(ways)} ways")

    with open(JSONL_IN, encoding="utf-8") as fh:
        trails = [json.loads(l) for l in fh]
    print(f"Aligning {len(trails)} curated trails ...")

    rows = []
    far_from_flag = []
    for idx, t in enumerate(trails):
        flag = None
        if t.get("flag_lng") is not None and t.get("flag_lat") is not None:
            flag = (t["flag_lng"], t["flag_lat"])
        segs = decode_path(t["path"], flag) if t.get("path") else []
        # Quality gate: the decoded geometry must sit on the scraped flag point.
        # A large gap means the axis order (or the path itself) is wrong — surface
        # it rather than silently feeding bad geometry into the match.
        if segs and flag is not None:
            pts = [p for seg in segs for p in seg]
            clng = sum(p[0] for p in pts) / len(pts)
            clat = sum(p[1] for p in pts) / len(pts)
            gap = haversine_mi(flag[1], flag[0], clat, clng)
            if gap > 3.0:
                far_from_flag.append((t["slug"], round(gap, 1)))
        cf, kept = match_trail(segs, ways, grid)
        status = classify(cf)
        # Only trust the matched ways for strong/good rows. For weak/none the
        # "best" way is the least-bad far-away one (e.g. 3.7km, wrong trail);
        # blank it so no downstream geometry-union can splice it onto the trail.
        if status not in ("strong", "good"):
            kept = []
        ids = [wid for wid, _ in kept]
        osm_names = [ways[w].name for w, _ in kept if ways[w].name]
        primary = osm_names[0] if osm_names else ""
        nsim = max((name_sim(t["name"], nm) for nm in osm_names), default=0.0)
        scale = next((ways[w].scale for w, _ in kept if ways[w].scale), "") or ""
        rows.append({
            "slug": t["slug"],
            "name": t["name"],
            "complex": t.get("complex", ""),
            "difficulty": t.get("difficulty", ""),
            "dist_from_bend_mi": (
                round(haversine_mi(BEND_LAT, BEND_LNG, t["flag_lat"], t["flag_lng"]), 1)
                if t.get("flag_lat") is not None and t.get("flag_lng") is not None
                else (round(haversine_mi(BEND_LAT, BEND_LNG, poly0[1], poly0[0]), 1)
                      if (poly0 := (segs[0][0] if segs else None)) else "")
            ),
            "geom_status": status,
            "covered_frac": round(cf, 2),
            "n_osm_ways": len(ids),
            "name_check": round(nsim, 2),
            "osm_primary_name": primary,
            "osm_mtb_scale": scale,
            "osm_ids": ";".join(map(str, ids)),
        })
        if (idx + 1) % 40 == 0:
            print(f"  {idx + 1}/{len(trails)}")

    cols = ["slug", "name", "complex", "difficulty", "dist_from_bend_mi", "geom_status",
            "covered_frac", "n_osm_ways", "name_check", "osm_primary_name",
            "osm_mtb_scale", "osm_ids"]
    with open(CSV_OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    by = defaultdict(int)
    for r in rows:
        by[r["geom_status"]] += 1
    tot = len(rows)
    print(f"\nWrote {CSV_OUT}")
    print("\nGeometry match quality:")
    for s in ("strong", "good", "weak", "none"):
        print(f"  {s:7s} {by[s]:4d}  ({100*by[s]//tot}%)")

    print("\nBy area (strong+good / total), with median dist from Bend:")
    area = defaultdict(list)
    for r in rows:
        area[r["complex"] or "(none)"].append(r)
    def med(v):
        v = sorted(x for x in v if isinstance(x, (int, float)))
        return v[len(v) // 2] if v else 0
    for a in sorted(area, key=lambda a: med([r["dist_from_bend_mi"] for r in area[a]])):
        rs = area[a]
        m = sum(r["geom_status"] in ("strong", "good") for r in rs)
        d = med([r["dist_from_bend_mi"] for r in rs])
        print(f"  {a:24s} {m:3d}/{len(rs):<3d}  ~{d:.0f}mi")

    conflict = [r for r in rows if r["geom_status"] in ("strong", "good")
                and r["osm_primary_name"] and r["name_check"] < 0.4]
    print(f"\n{len(conflict)} strong-geometry / weak-name rows (likely OSM name differs):")
    for r in sorted(conflict, key=lambda r: -r["covered_frac"])[:15]:
        print(f"  {r['name'][:28]:28s} -> {r['osm_primary_name'][:34]:34s} cf={r['covered_frac']}")

    # Decode quality gate: any trail whose decoded geometry doesn't land on its
    # flag point indicates a bad path/axis decode — should be zero.
    if far_from_flag:
        print(f"\n!! {len(far_from_flag)} trails decoded FAR from their flag point:")
        for slug, gap in sorted(far_from_flag, key=lambda x: -x[1])[:20]:
            print(f"   {slug[:36]:36s} {gap} mi off")
    else:
        print("\nDecode gate: all trails decoded onto their flag point. OK")


if __name__ == "__main__":
    main()
