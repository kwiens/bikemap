#!/usr/bin/env python3
"""Build a classified Bend bike network GeoJSON from OpenStreetMap.

bendbikes.org publishes a lovely color-coded Bend bike map (low-stress routes,
bike lanes, paved/unpaved trails). That classification is their editorial work,
so rather than copy it we derive our own from OSM tags — a Level-of-Traffic-
Stress-lite scheme — and credit OSM. Output feeds a toggleable "bike network"
overlay (the app's Casual mode).

Pipeline: one Overpass query for every classifiable highway in a Bend bbox
(geometry included), classify each way by its tags, write a single GeoJSON
FeatureCollection with a `class` property per feature.

  python scripts/build_bend_bike_network.py
  python scripts/build_bend_bike_network.py --bbox=-121.42,43.95,-121.18,44.12
  python scripts/build_bend_bike_network.py --overpass-ssh user@host   # if blocked

Output: public/data/bend/bike-network.geojson
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time

import osm_trail_elevation as ote  # reuse Overpass request infra (retry + SSH)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE_DIR = os.path.join(HERE, ".osm_cache")

# Bend city + Old Mill / downtown / eastside + the river-trail corridor.
DEFAULT_BBOX = (-121.42, 43.95, -121.18, 44.12)  # (w, s, e, n)


def cache_path(query: str) -> str:
    """Cache keyed by the exact Overpass query (bbox + filters), so rerunning
    with a different --bbox doesn't return a stale extent."""
    h = hashlib.sha1(query.encode("utf-8")).hexdigest()[:12]
    return os.path.join(CACHE_DIR, f"network_{h}.json")

# Highway kinds we pull: bike-relevant paths + the street classes we grade for
# comfort. Excludes motorways, service/driveways, and non-route footways.
HIGHWAY_RE = (
    "^(cycleway|path|footway|bridleway|track|pedestrian|living_street|"
    "residential|unclassified|tertiary|tertiary_link|secondary|secondary_link|"
    "primary|primary_link|trunk|trunk_link)$"
)

PAVED = {"paved", "asphalt", "concrete", "concrete:plates", "concrete:lanes",
         "paving_stones", "sett", "metal", "wood"}
UNPAVED = {"unpaved", "gravel", "fine_gravel", "compacted", "dirt", "ground",
           "earth", "grass", "mud", "sand", "pebblestone", "rock", "woodchips"}
CYCLEWAY_INFRA = {"lane", "track", "buffered_lane", "share_busway",
                  "opposite_lane", "opposite_track", "shared_lane"}
CALM = {"residential", "living_street", "unclassified"}
CAUTION = {"tertiary", "tertiary_link", "secondary", "secondary_link",
           "primary", "primary_link", "trunk", "trunk_link"}

# class -> (label, color) — mirrors bendbikes' palette, OSM-derived.
CLASSES = {
    "paved_trail": ("Paved trail", "#16A34A"),
    "unpaved_trail": ("Unpaved trail", "#B45309"),
    "bike_lane": ("Bike lane", "#2563EB"),
    "calm_street": ("Calm street", "#84CC16"),
    "caution": ("Use caution", "#F97316"),
}


def build_query(bbox) -> str:
    w, s, e, n = bbox
    return (
        "[out:json][timeout:180];"
        f'way["highway"]["highway"~"{HIGHWAY_RE}"]'
        f"({s},{w},{n},{e});"
        "out geom;"
    )


def fetch(bbox, overpass_url) -> dict:
    query = build_query(bbox)
    cache = cache_path(query)
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, encoding="utf-8") as fh:
            return json.load(fh)
    print(f"Querying Overpass for bbox {bbox} ...")
    data = None
    for attempt in range(4):
        try:
            data = ote._overpass_request(overpass_url, query)
            break
        except Exception as e:  # noqa: BLE001 — retry transient Overpass failures
            print(f"  attempt {attempt + 1} failed: {e}")
            time.sleep(5 * (attempt + 1))
    if data is None:
        raise SystemExit("Overpass failed after retries (try --overpass-ssh).")
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    return data


def has_bike_lane(tags: dict) -> bool:
    for k, v in tags.items():
        if k == "cycleway" or k.startswith("cycleway:"):
            if v in CYCLEWAY_INFRA:
                return True
    return False


def is_paved(tags: dict) -> bool | None:
    surf = tags.get("surface")
    if surf in PAVED:
        return True
    if surf in UNPAVED:
        return False
    return None  # unknown


def classify(tags: dict) -> str | None:
    """Return a class key, or None to drop the way (not a bike route)."""
    hw = tags.get("highway")
    bicycle = tags.get("bicycle")
    access = tags.get("access")

    # Hard exclusions: bikes forbidden, or private with no bike exception.
    if bicycle in ("no", "dismount", "private"):
        return None
    if access in ("private", "no") and bicycle not in ("yes", "designated", "permissive"):
        return None
    # Sidewalks and crossings aren't routes.
    if hw == "footway" and tags.get("footway") in ("sidewalk", "crossing"):
        return None

    paved = is_paved(tags)

    # Off-street, dedicated bike infrastructure first. A dedicated cycleway is
    # paved by convention unless tagged otherwise; a generic path/footway is only
    # "paved" when its surface explicitly says so (untagged forest paths are dirt).
    if hw == "cycleway":
        return "unpaved_trail" if paved is False else "paved_trail"
    if hw in ("path", "footway", "pedestrian", "bridleway"):
        # Only count as a route if bikes are actually allowed there.
        if bicycle in ("designated", "yes", "permissive") or tags.get("segregated"):
            return "paved_trail" if paved is True else "unpaved_trail"
        return None
    if hw == "track":
        # Tracks are bikeable gravel/dirt unless bikes are denied (handled above).
        return "paved_trail" if paved is True else "unpaved_trail"

    # On-street: bike lane beats the road's base comfort class.
    if has_bike_lane(tags):
        return "bike_lane"
    if hw in CALM:
        return "calm_street"
    if hw in CAUTION:
        return "caution"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="w,s,e,n (lng,lat)")
    ap.add_argument("--region", default="bend",
                    help="region slug for the default output path")
    ap.add_argument("--out", help="output GeoJSON path (overrides --region)")
    ap.add_argument("--overpass-url", default=ote.OVERPASS_URL_DEFAULT)
    ap.add_argument("--overpass-ssh", help="user@host to proxy Overpass via SSH")
    args = ap.parse_args()
    if args.overpass_ssh:
        ote.OVERPASS_SSH_HOST = args.overpass_ssh
    bbox = tuple(float(x) for x in args.bbox.split(",")) if args.bbox else DEFAULT_BBOX
    out = args.out or os.path.join(
        ROOT, "public", "data", args.region, "bike-network.geojson")

    data = fetch(bbox, args.overpass_url)
    elements = [e for e in data.get("elements", []) if e.get("type") == "way"]
    print(f"{len(elements)} highway ways in bbox")

    features = []
    counts = {k: 0 for k in CLASSES}
    dropped = 0
    for el in elements:
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue
        tags = el.get("tags", {})
        cls = classify(tags)
        if cls is None:
            dropped += 1
            continue
        counts[cls] += 1
        # 5 decimals ≈ 1m — plenty for a ~2px overlay line, ~15% smaller file.
        coords = [[round(p["lon"], 5), round(p["lat"], 5)] for p in geom]
        props = {"class": cls}
        if tags.get("name"):
            props["name"] = tags["name"]
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "LineString", "coordinates": coords},
        })

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap contributors",
            "bbox": list(bbox),
            "classes": {k: {"label": v[0], "color": v[1]} for k, v in CLASSES.items()},
        },
        "features": features,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, separators=(",", ":"))

    print(f"\nWrote {len(features)} features -> {out} ({os.path.getsize(out)//1024} KB)")
    print(f"dropped (not a bike route): {dropped}")
    for k, (label, _) in CLASSES.items():
        print(f"  {label:14s} {counts[k]}")


if __name__ == "__main__":
    main()
