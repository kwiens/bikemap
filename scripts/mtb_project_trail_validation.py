#!/usr/bin/env python3
"""Validate local curated MTB trails against MTB Project BikeRoute metadata.

This is intentionally a validation tool, not a state-wide route crawler. It
reads the app's curated trail array, builds small bounding boxes around those
known trail areas, fetches minimal MTB Project route metadata exposed through
the Backcountry web GraphQL API, and writes a comparison report under
tmp/mtb-project-validation/.

Usage:
  MTB_PROJECT_BEARER_TOKEN=... python scripts/mtb_project_trail_validation.py --city chattanooga
  python scripts/mtb_project_trail_validation.py --city chattanooga --dry-run
  python scripts/mtb_project_trail_validation.py --city chattanooga \
    --route-json tmp/mtb-project-validation/chattanooga/mtb-project-bike-routes.json --no-fetch

Requires: pip install -r scripts/requirements.txt
"""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parents[1]
GRAPHQL_ENDPOINT = "https://api.production.onxmaps.com/v1/supergraph/"
DEFAULT_OUTPUT_ROOT = ROOT / "tmp" / "mtb-project-validation"
QUERY_LIMIT = 50
MAX_MANUAL_BBOX_AREA_DEG2 = 0.25

CITY_TRAIL_FILES = {
    "chattanooga": ROOT / "src" / "data" / "mountain-bike-trails.data.ts",
    "bend": ROOT / "src" / "data" / "cities" / "bend" / "mountain-bike-trails.data.ts",
}

STATE_REGION_MESSAGE = (
    "State-wide MTB Project extraction is intentionally unsupported by this "
    "repository tool. Use --city chattanooga for the current Tennessee curated "
    "trail coverage, or --city bend after Bend's curated trail data file exists."
)


@dataclass
class LocalTrail:
    trail_name: str
    display_name: str
    rec_area: str
    rating: str
    distance_mi: float | None
    default_bounds: tuple[float, float, float, float]
    osm_ids: tuple[int, ...]


def main() -> int:
    args = parse_args()
    if args.region:
        print(STATE_REGION_MESSAGE, file=sys.stderr)
        return 2

    trails = load_local_trails(args.city)
    if args.area:
        wanted = set(args.area)
        trails = [trail for trail in trails if trail.rec_area in wanted]
    if not trails:
        print(f"No local trails found for city={args.city}.", file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir or DEFAULT_OUTPUT_ROOT / args.city)
    output_dir.mkdir(parents=True, exist_ok=True)

    bboxes = build_area_bboxes(trails, args.padding)
    if args.dry_run:
        print(json.dumps({"city": args.city, "areas": bboxes}, indent=2))
        return 0

    route_payload = None
    route_json = Path(args.route_json) if args.route_json else output_dir / "mtb-project-bike-routes.json"
    if args.no_fetch:
        if not route_json.exists():
            print(f"--no-fetch requested but {route_json} does not exist.", file=sys.stderr)
            return 1
        route_payload = json.loads(route_json.read_text())
    else:
        token = normalize_token(os.environ.get("MTB_PROJECT_BEARER_TOKEN"))
        if not token:
            print(
                "Set MTB_PROJECT_BEARER_TOKEN to a current Backcountry web bearer token.",
                file=sys.stderr,
            )
            return 1
        route_payload = fetch_routes_for_areas(
            bboxes=bboxes,
            output_dir=output_dir,
            token=token,
            max_depth=args.max_depth,
            sleep_s=args.sleep,
            refresh=args.refresh,
        )
        route_json.write_text(json.dumps(route_payload, indent=2))

    routes = route_payload.get("routes", [])
    report = build_report(
        city=args.city,
        trails=trails,
        routes=routes,
        distance_delta_mi=args.distance_delta_mi,
        distance_delta_pct=args.distance_delta_pct,
    )

    report_json = output_dir / "mtb-project-validation-report.json"
    report_csv = output_dir / "mtb-project-validation-report.csv"
    report_json.write_text(json.dumps(report, indent=2))
    write_report_csv(report, report_csv)

    summary = report["summary"]
    print(
        "local={local_count} mtb_project={mtb_project_count} strong={strong_count} "
        "possible={possible_count} unmatched_local={unmatched_local_count} "
        "unmatched_mtb_project={unmatched_mtb_project_count} distance_flags={distance_issue_count}".format(
            **summary
        )
    )
    print(f"routes: {route_json}")
    print(f"report: {report_json}")
    print(f"csv:    {report_csv}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", choices=sorted(CITY_TRAIL_FILES), default="chattanooga")
    parser.add_argument(
        "--region",
        help="Intentionally unsupported. State-wide MTB Project extraction is not built into this tool.",
    )
    parser.add_argument(
        "--area",
        action="append",
        help="Limit validation to a recArea. Repeat for multiple areas.",
    )
    parser.add_argument("--output-dir", help="Defaults to tmp/mtb-project-validation/<city>.")
    parser.add_argument("--route-json", help="Read/write cached MTB Project route metadata JSON.")
    parser.add_argument("--no-fetch", action="store_true", help="Compare from --route-json only.")
    parser.add_argument("--refresh", action="store_true", help="Ignore per-bbox HTTP cache files.")
    parser.add_argument("--dry-run", action="store_true", help="Print derived local bboxes only.")
    parser.add_argument("--padding", type=float, default=0.015, help="Degrees to pad each local area bbox.")
    parser.add_argument("--max-depth", type=int, default=5, help="Max recursive bbox split depth.")
    parser.add_argument("--sleep", type=float, default=0.25, help="Seconds between uncached API requests.")
    parser.add_argument("--distance-delta-mi", type=float, default=0.3)
    parser.add_argument("--distance-delta-pct", type=float, default=0.25)
    return parser.parse_args()


def normalize_token(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return raw


def load_local_trails(city: str) -> list[LocalTrail]:
    path = CITY_TRAIL_FILES[city]
    if not path.exists():
        raise SystemExit(
            f"{path} does not exist. {city} has no curated MTB trail array to validate yet."
        )

    text = strip_ts_comments(path.read_text())
    array_text = extract_mountain_bike_array(text, path)
    trails = []
    for body in split_object_literals(array_text):
        trail_name = string_prop(body, "trailName")
        display_name = string_prop(body, "displayName") or trail_name
        rec_area = string_prop(body, "recArea")
        rating = string_prop(body, "rating") or ""
        bounds = bounds_prop(body, "defaultBounds")
        if not (trail_name and rec_area and bounds):
            continue
        trails.append(
            LocalTrail(
                trail_name=trail_name,
                display_name=display_name,
                rec_area=rec_area,
                rating=rating,
                distance_mi=number_prop(body, "distance"),
                default_bounds=bounds,
                osm_ids=osm_ids_prop(body),
            )
        )
    return trails


def strip_ts_comments(text: str) -> str:
    """Remove TypeScript comments without touching string literals."""
    out = []
    i = 0
    quote = None
    escape = False
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if quote:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and nxt == "/":
            while i < len(text) and text[i] != "\n":
                i += 1
            out.append("\n")
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                out.append("\n" if text[i] == "\n" else " ")
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def extract_mountain_bike_array(text: str, path: Path) -> str:
    match = re.search(r"(?:mountainBikeTrails|[A-Za-z]+MountainBikeTrails)\b[^=]*=\s*\[", text)
    if not match:
        raise SystemExit(f"Could not find mountainBikeTrails in {path}.")
    start = match.end() - 1
    end = matching_delimiter(text, start, "[", "]")
    return text[start + 1 : end]


def split_object_literals(array_text: str) -> list[str]:
    objects = []
    i = 0
    while i < len(array_text):
        if array_text[i] != "{":
            i += 1
            continue
        end = matching_delimiter(array_text, i, "{", "}")
        objects.append(array_text[i + 1 : end])
        i = end + 1
    return objects


def matching_delimiter(text: str, start: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    quote = None
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i
    raise ValueError(f"No matching {close_ch} found")


def string_prop(body: str, prop: str) -> str | None:
    match = re.search(rf"{prop}\s*:\s*(['\"])((?:\\.|(?!\1).)*?)\1", body, re.S)
    if not match:
        return None
    raw = f"{match.group(1)}{match.group(2)}{match.group(1)}"
    try:
        return ast.literal_eval(raw)
    except (SyntaxError, ValueError):
        return match.group(2)


def number_prop(body: str, prop: str) -> float | None:
    match = re.search(rf"{prop}\s*:\s*(-?\d+(?:\.\d+)?)", body)
    return float(match.group(1)) if match else None


def bounds_prop(body: str, prop: str) -> tuple[float, float, float, float] | None:
    match = re.search(rf"{prop}\s*:\s*\[([^\]]+)\]", body)
    if not match:
        return None
    vals = [float(v.strip()) for v in match.group(1).split(",")]
    if len(vals) != 4:
        return None
    return (vals[0], vals[1], vals[2], vals[3])


def osm_ids_prop(body: str) -> tuple[int, ...]:
    match = re.search(r"osmIds\s*:\s*\[([^\]]*)\]", body)
    if not match:
        return ()
    return tuple(int(v.strip()) for v in match.group(1).split(",") if v.strip())


def build_area_bboxes(trails: list[LocalTrail], padding: float) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for trail in trails:
        bbox = trail.default_bounds
        group = grouped.setdefault(
            trail.rec_area,
            {
                "recArea": trail.rec_area,
                "localCount": 0,
                "bbox": [math.inf, math.inf, -math.inf, -math.inf],
            },
        )
        group["localCount"] += 1
        group["bbox"][0] = min(group["bbox"][0], bbox[0])
        group["bbox"][1] = min(group["bbox"][1], bbox[1])
        group["bbox"][2] = max(group["bbox"][2], bbox[2])
        group["bbox"][3] = max(group["bbox"][3], bbox[3])

    out = []
    for group in grouped.values():
        left, bottom, right, top = group["bbox"]
        padded = [left - padding, bottom - padding, right + padding, top + padding]
        if bbox_area(padded) > MAX_MANUAL_BBOX_AREA_DEG2:
            out.extend(build_trail_bboxes_for_area(trails, group["recArea"], padding))
            continue
        group["bbox"] = [round(v, 6) for v in padded]
        out.append(group)
    return sorted(out, key=lambda item: item["recArea"])


def build_trail_bboxes_for_area(
    trails: list[LocalTrail],
    rec_area: str,
    padding: float,
) -> list[dict[str, Any]]:
    out = []
    for trail in trails:
        if trail.rec_area != rec_area:
            continue
        left, bottom, right, top = trail.default_bounds
        padded = [left - padding, bottom - padding, right + padding, top + padding]
        if bbox_area(padded) > MAX_MANUAL_BBOX_AREA_DEG2:
            raise SystemExit(
                f"Refusing oversized MTB Project query bbox for {rec_area} / {trail.trail_name}: {padded}. "
                f"{STATE_REGION_MESSAGE}"
            )
        out.append(
            {
                "recArea": f"{rec_area} / {trail.trail_name}",
                "localCount": 1,
                "bbox": [round(v, 6) for v in padded],
            }
        )
    return out


def bbox_area(bbox: list[float] | tuple[float, float, float, float]) -> float:
    left, bottom, right, top = bbox
    return abs((right - left) * (top - bottom))


def fetch_routes_for_areas(
    *,
    bboxes: list[dict[str, Any]],
    output_dir: Path,
    token: str,
    max_depth: int,
    sleep_s: float,
    refresh: bool,
) -> dict[str, Any]:
    session = requests.Session()
    cache_dir = output_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    all_routes: dict[str, dict[str, Any]] = {}
    area_summaries = []
    capped_leaves = []
    request_count = 0

    for area in bboxes:
        routes, request_delta, capped = collect_bbox_routes(
            session=session,
            cache_dir=cache_dir,
            token=token,
            bbox=area["bbox"],
            label=area["recArea"],
            depth=0,
            max_depth=max_depth,
            sleep_s=sleep_s,
            refresh=refresh,
        )
        request_count += request_delta
        capped_leaves.extend(capped)
        new_count = 0
        for route in routes:
            if route["id"] not in all_routes:
                new_count += 1
            all_routes[route["id"]] = route
        area_summaries.append(
            {
                **area,
                "rawMtbProjectHits": len(routes),
                "newUniqueMtbProjectRoutes": new_count,
            }
        )
        print(
            f"{area['localCount']:3d} local | {len(routes):3d} MTB Project raw | "
            f"{new_count:3d} new | {area['recArea']}"
        )

    return {
        "generatedAt": now_iso(),
        "endpoint": GRAPHQL_ENDPOINT,
        "query": "bikeRoutes(filter: { location: { withinBounds } }, limit: 50)",
        "requests": request_count,
        "cappedLeaves": capped_leaves,
        "areas": area_summaries,
        "routes": sorted(all_routes.values(), key=lambda route: route["name"]),
    }


def collect_bbox_routes(
    *,
    session: requests.Session,
    cache_dir: Path,
    token: str,
    bbox: list[float],
    label: str,
    depth: int,
    max_depth: int,
    sleep_s: float,
    refresh: bool,
) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
    routes, did_request = query_mtb_project_bbox(
        session=session,
        cache_dir=cache_dir,
        token=token,
        bbox=bbox,
        label=label,
        sleep_s=sleep_s,
        refresh=refresh,
    )
    if len(routes) >= QUERY_LIMIT and depth < max_depth:
        merged = []
        request_total = did_request
        capped = []
        for idx, child in enumerate(split_bbox(bbox), start=1):
            child_routes, child_requests, child_capped = collect_bbox_routes(
                session=session,
                cache_dir=cache_dir,
                token=token,
                bbox=child,
                label=f"{label}/{idx}",
                depth=depth + 1,
                max_depth=max_depth,
                sleep_s=sleep_s,
                refresh=refresh,
            )
            merged.extend(child_routes)
            request_total += child_requests
            capped.extend(child_capped)
        return merged, request_total, capped

    capped = []
    if len(routes) >= QUERY_LIMIT:
        capped.append({"label": label, "bbox": bbox, "routeCount": len(routes)})
    return routes, did_request, capped


def query_mtb_project_bbox(
    *,
    session: requests.Session,
    cache_dir: Path,
    token: str,
    bbox: list[float],
    label: str,
    sleep_s: float,
    refresh: bool,
) -> tuple[list[dict[str, Any]], int]:
    cache_path = cache_dir / f"{bbox_cache_key(bbox)}.json"
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text())
        return cached["routes"], 0

    left, bottom, right, top = [round(v, 6) for v in bbox]
    query = f"""
      query BikeRoutesByBounds {{
        bikeRoutes(
          filter: {{
            location: {{
              withinBounds: {{
                bottom: {bottom}
                left: {left}
                right: {right}
                top: {top}
              }}
            }}
          }}
          limit: {QUERY_LIMIT}
        ) {{
          id
          name
          location
          length
          elevationGain
          elevationLoss
          difficultyRating
          pathKind
          identifiers
        }}
      }}
    """
    headers = {
        "accept": "*/*",
        "apollographql-client-name": "onxmaps.backcountry.web",
        "apollographql-client-version": "26.25-5904+374b95435",
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "onx-application-id": "backcountry",
        "onx-application-platform": "web",
        "onx-application-version": "4.0.0",
        "origin": "https://webmap.onxmaps.com",
        "referer": "https://webmap.onxmaps.com/",
        "user-agent": "bikemap-mtb-project-validation/1.0",
    }
    if sleep_s > 0:
        time.sleep(sleep_s)
    response = session.post(
        GRAPHQL_ENDPOINT,
        headers=headers,
        json={"operationName": "BikeRoutesByBounds", "query": query},
        timeout=45,
    )
    try:
        payload = response.json()
    except ValueError as exc:
        raise SystemExit(f"{label}: MTB Project query returned non-JSON HTTP {response.status_code}") from exc
    if response.status_code >= 400 or payload.get("errors"):
        errors = "; ".join(error.get("message", "") for error in payload.get("errors", []))
        raise SystemExit(f"{label}: MTB Project query failed HTTP {response.status_code}: {errors}")
    routes = payload.get("data", {}).get("bikeRoutes", [])
    cache_path.write_text(json.dumps({"label": label, "bbox": bbox, "routes": routes}, indent=2))
    return routes, 1


def bbox_cache_key(bbox: list[float]) -> str:
    raw = ",".join(f"{v:.6f}" for v in bbox)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def split_bbox(bbox: list[float]) -> list[list[float]]:
    left, bottom, right, top = bbox
    mid_x = (left + right) / 2
    mid_y = (bottom + top) / 2
    return [
        [left, bottom, mid_x, mid_y],
        [mid_x, bottom, right, mid_y],
        [left, mid_y, mid_x, top],
        [mid_x, mid_y, right, top],
    ]


def build_report(
    *,
    city: str,
    trails: list[LocalTrail],
    routes: list[dict[str, Any]],
    distance_delta_mi: float,
    distance_delta_pct: float,
) -> dict[str, Any]:
    pairs = []
    for local_idx, trail in enumerate(trails):
        for route_idx, route in enumerate(routes):
            score, name_score, geo_dist = score_pair(trail, route)
            if score >= 0.52:
                pairs.append(
                    {
                        "localIdx": local_idx,
                        "routeIdx": route_idx,
                        "score": score,
                        "nameScore": name_score,
                        "geoDistanceMi": geo_dist,
                    }
                )
    pairs.sort(key=lambda pair: (-pair["score"], pair["geoDistanceMi"]))

    local_matches: dict[int, dict[str, Any]] = {}
    route_matches: dict[int, dict[str, Any]] = {}
    for pair in pairs:
        if pair["localIdx"] in local_matches or pair["routeIdx"] in route_matches:
            continue
        if pair["score"] >= 0.6:
            local_matches[pair["localIdx"]] = pair
            route_matches[pair["routeIdx"]] = pair

    matches = []
    for local_idx, pair in local_matches.items():
        trail = trails[local_idx]
        route = routes[pair["routeIdx"]]
        route_mi = meters_to_miles(route.get("length"))
        delta = None
        delta_pct = None
        distance_flag = False
        if trail.distance_mi is not None and route_mi is not None:
            delta = route_mi - trail.distance_mi
            delta_pct = delta / max(0.01, trail.distance_mi)
            distance_flag = abs(delta) >= distance_delta_mi and abs(delta_pct) >= distance_delta_pct
        matches.append(
            {
                "status": "strong" if pair["score"] >= 0.8 else "possible",
                "localName": trail.trail_name,
                "displayName": trail.display_name,
                "recArea": trail.rec_area,
                "localDistanceMi": trail.distance_mi,
                "mtbProjectId": route.get("id"),
                "mtbProjectName": route.get("name"),
                "mtbProjectDistanceMi": round(route_mi, 2) if route_mi is not None else None,
                "mtbProjectDifficulty": route.get("difficultyRating"),
                "mtbProjectPathKind": route.get("pathKind"),
                "score": round(pair["score"], 3),
                "geoDistanceMi": round(pair["geoDistanceMi"], 2),
                "distanceDeltaMi": round(delta, 2) if delta is not None else None,
                "distanceDeltaPct": round(delta_pct * 100) if delta_pct is not None else None,
                "distanceFlag": distance_flag,
                "identifiers": route.get("identifiers", []),
            }
        )

    best_by_local = {pair["localIdx"]: pair for pair in pairs}
    unmatched_local = []
    for idx, trail in enumerate(trails):
        if idx in local_matches:
            continue
        best = best_by_local.get(idx)
        best_route = routes[best["routeIdx"]] if best else None
        unmatched_local.append(
            {
                "localName": trail.trail_name,
                "displayName": trail.display_name,
                "recArea": trail.rec_area,
                "localDistanceMi": trail.distance_mi,
                "bestMtbProjectName": best_route.get("name") if best_route else None,
                "bestScore": round(best["score"], 3) if best else 0,
                "bestGeoDistanceMi": round(best["geoDistanceMi"], 2) if best else None,
            }
        )

    unmatched_mtb_project = []
    for idx, route in enumerate(routes):
        if idx in route_matches:
            continue
        route_mi = meters_to_miles(route.get("length"))
        unmatched_mtb_project.append(
            {
                "mtbProjectId": route.get("id"),
                "mtbProjectName": route.get("name"),
                "mtbProjectDistanceMi": round(route_mi, 2) if route_mi is not None else None,
                "mtbProjectDifficulty": route.get("difficultyRating"),
                "mtbProjectPathKind": route.get("pathKind"),
                "location": route.get("location", {}).get("coordinates"),
                "identifiers": route.get("identifiers", []),
            }
        )

    strong = [match for match in matches if match["status"] == "strong"]
    possible = [match for match in matches if match["status"] == "possible"]
    distance_issues = [match for match in strong if match["distanceFlag"]]

    return {
        "generatedAt": now_iso(),
        "city": city,
        "summary": {
            "local_count": len(trails),
            "mtb_project_count": len(routes),
            "strong_count": len(strong),
            "possible_count": len(possible),
            "unmatched_local_count": len(unmatched_local),
            "unmatched_mtb_project_count": len(unmatched_mtb_project),
            "distance_issue_count": len(distance_issues),
        },
        "strongMatches": sorted(strong, key=lambda item: (item["recArea"], item["localName"])),
        "possibleMatches": sorted(possible, key=lambda item: -item["score"]),
        "unmatchedLocal": sorted(unmatched_local, key=lambda item: (item["recArea"], item["localName"])),
        "unmatchedMtbProject": sorted(
            unmatched_mtb_project,
            key=lambda item: item["mtbProjectName"] or "",
        ),
        "distanceIssues": sorted(
            distance_issues,
            key=lambda item: abs(item["distanceDeltaPct"] or 0),
            reverse=True,
        ),
    }


def score_pair(trail: LocalTrail, route: dict[str, Any]) -> tuple[float, float, float]:
    local_name = trail.display_name or trail.trail_name
    route_name = route.get("name", "")
    name_score = max(
        contains_score(local_name, route_name),
        jaccard_score(local_name, route_name) * 0.96,
        levenshtein_score(local_name, route_name) * 0.92,
    )
    coords = route.get("location", {}).get("coordinates")
    geo_dist = haversine_miles(center(trail.default_bounds), coords) if coords else 99.0
    score = name_score
    if geo_dist < 0.75:
        score += 0.1
    elif geo_dist < 2.5:
        score += 0.05
    elif geo_dist > 12:
        score = min(score * 0.55, 0.55)
    elif geo_dist > 6:
        score = min(score * 0.75, 0.68)
    elif geo_dist > 3.5:
        score = min(score * 0.9, 0.78)
    return min(1.0, score), name_score, geo_dist


def normalize_name(value: str) -> str:
    out = value.lower()
    out = out.replace("&", " and ").replace("'", "").replace("’", "")
    out = re.sub(r"\b(mountain bike|bike|mtb|trail|trails|loop|phase|path|route)\b", " ", out)
    out = re.sub(r"\b(the|and|with|option|access)\b", " ", out)
    out = re.sub(r"#\d+", " ", out)
    out = re.sub(r"\b\d+\b", " ", out)
    out = re.sub(r"[^a-z0-9]+", " ", out)
    return re.sub(r"\s+", " ", out).strip()


def token_set(value: str) -> set[str]:
    normalized = normalize_name(value)
    return set(normalized.split()) if normalized else set()


def jaccard_score(a: str, b: str) -> float:
    a_tokens = token_set(a)
    b_tokens = token_set(b)
    if not a_tokens or not b_tokens:
        return 0.0
    intersection = len(a_tokens & b_tokens)
    union = len(a_tokens | b_tokens)
    return intersection / union


def contains_score(a: str, b: str) -> float:
    a_norm = normalize_name(a)
    b_norm = normalize_name(b)
    if not a_norm or not b_norm:
        return 0.0
    if a_norm == b_norm:
        return 1.0
    if len(a_norm) >= 4 and a_norm in b_norm:
        return min(0.98, len(a_norm) / len(b_norm) + 0.32)
    if len(b_norm) >= 4 and b_norm in a_norm:
        return min(0.96, len(b_norm) / len(a_norm) + 0.28)
    return 0.0


def levenshtein_score(a: str, b: str) -> float:
    a_norm = normalize_name(a)
    b_norm = normalize_name(b)
    if not a_norm and not b_norm:
        return 1.0
    if not a_norm or not b_norm:
        return 0.0
    rows = len(a_norm) + 1
    cols = len(b_norm) + 1
    dp = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        dp[i][0] = i
    for j in range(cols):
        dp[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a_norm[i - 1] == b_norm[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    return 1 - dp[-1][-1] / max(len(a_norm), len(b_norm))


def center(bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)


def haversine_miles(a: tuple[float, float], b: list[float] | tuple[float, float]) -> float:
    radius_mi = 3958.7613
    lng1, lat1 = a
    lng2, lat2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2) ** 2
    return 2 * radius_mi * math.asin(math.sqrt(h))


def meters_to_miles(value: Any) -> float | None:
    if value is None:
        return None
    return float(value) * 0.000621371192


def write_report_csv(report: dict[str, Any], path: Path) -> None:
    fields = [
        "status",
        "localName",
        "recArea",
        "localDistanceMi",
        "mtbProjectName",
        "mtbProjectDistanceMi",
        "score",
        "geoDistanceMi",
        "distanceDeltaMi",
        "distanceDeltaPct",
        "distanceFlag",
        "mtbProjectId",
        "mtbProjectDifficulty",
    ]
    rows = []
    for key in ("strongMatches", "possibleMatches"):
        for item in report[key]:
            rows.append({field: item.get(field) for field in fields})
    for item in report["unmatchedLocal"]:
        rows.append(
            {
                "status": "unmatched_local",
                "localName": item["localName"],
                "recArea": item["recArea"],
                "localDistanceMi": item["localDistanceMi"],
                "mtbProjectName": item["bestMtbProjectName"],
                "score": item["bestScore"],
                "geoDistanceMi": item["bestGeoDistanceMi"],
            }
        )
    for item in report["unmatchedMtbProject"]:
        rows.append(
            {
                "status": "unmatched_mtb_project",
                "mtbProjectName": item["mtbProjectName"],
                "mtbProjectDistanceMi": item["mtbProjectDistanceMi"],
                "mtbProjectId": item["mtbProjectId"],
                "mtbProjectDifficulty": item["mtbProjectDifficulty"],
            }
        )

    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    raise SystemExit(main())
