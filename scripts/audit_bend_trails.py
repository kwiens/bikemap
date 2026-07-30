#!/usr/bin/env python3
"""Audit Bend trail segment joins and generated elevation profiles.

The Bend pipeline builds a trail from one or more OSM ways. This audit reports
two related failure modes:

* source gaps: reference-traced OSM sections whose endpoints do not meet;
* insufficient geometry: less than 90% of the reference has a nearby OSM way;
* profile teleports: adjacent profile points at the same cumulative distance
  whose coordinates do not meet.

Run after ``scripts/build_bend_trails.py`` to verify generated data, or pass a
trail name/slug to inspect one trail in detail.

  python scripts/audit_bend_trails.py
  python scripts/audit_bend_trails.py expressway
  python scripts/audit_bend_trails.py --json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import asdict, dataclass

from build_bend_trails import (
    JSONL,
    MATCH_CSV,
    clean_name,
)
from osm_trail_elevation import haversine_m

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELEV_DIR = os.path.join(ROOT, "public", "data", "elevation")
M_TO_FT = 3.280839895
DEFAULT_GAP_FT = 50.0
MIN_GEOMETRY_COVERAGE = 0.90


@dataclass
class Issue:
    trail: str
    slug: str
    kind: str
    boundary: int
    gap_ft: int
    elevation_jump_ft: int | None = None
    coverage: float | None = None
    from_coord: list[float] | None = None
    to_coord: list[float] | None = None


def load_selected_rows(min_cover: float) -> list[dict[str, str]]:
    with open(MATCH_CSV, encoding="utf-8") as fh:
        return [
            row
            for row in csv.DictReader(fh)
            if row["geom_status"] in ("strong", "good")
            and row["osm_ids"]
            and float(row["covered_frac"]) >= min_cover
        ]


def load_display_names() -> dict[str, str]:
    with open(JSONL, encoding="utf-8") as fh:
        return {
            item["slug"]: clean_name(item.get("name") or item["slug"])
            for item in (json.loads(line) for line in fh)
        }


def source_gap_issues(
    trail: str,
    slug: str,
    segments: list[list[list[float]]],
    threshold_ft: float,
) -> list[Issue]:
    issues = []
    for boundary, (left, right) in enumerate(zip(segments, segments[1:]), 1):
        gap_ft = haversine_m(*left[-1], *right[0]) * M_TO_FT
        if gap_ft >= threshold_ft:
            issues.append(
                Issue(trail, slug, "source_gap", boundary, round(gap_ft))
            )
    return issues


def load_profile(slug: str) -> dict | None:
    path = os.path.join(ELEV_DIR, f"{slug}.json")
    if not os.path.exists(path):
        return None

    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def geometry_quality_issues(
    trail: str,
    slug: str,
    profile: dict,
    threshold_ft: float,
) -> list[Issue]:
    coverage = profile.get("geometryCoverage")
    issues = []
    if coverage is not None and coverage < MIN_GEOMETRY_COVERAGE:
        issues.append(
            Issue(
                trail,
                slug,
                "insufficient_geometry",
                0,
                0,
                coverage=coverage,
            )
        )
    details = profile.get("geometryGapDetails") or [
        {"feet": gap_ft}
        for gap_ft in profile.get("geometryGaps", [])
    ]
    for boundary, detail in enumerate(details, 1):
        gap_ft = detail["feet"]
        if gap_ft >= threshold_ft:
            issues.append(
                Issue(
                    trail,
                    slug,
                    "source_gap",
                    boundary,
                    gap_ft,
                    from_coord=detail.get("from"),
                    to_coord=detail.get("to"),
                )
            )
    return issues


def profile_teleport_issues(
    trail: str,
    slug: str,
    threshold_ft: float,
    profile: dict | None = None,
) -> list[Issue]:
    profile = profile or load_profile(slug)
    if profile is None:
        return [Issue(trail, slug, "missing_profile", 0, 0)]
    points = profile.get("profile", [])

    issues = []
    for boundary, (left, right) in enumerate(zip(points, points[1:]), 1):
        if right[0] != left[0]:
            continue
        gap_ft = haversine_m(left[2], left[3], right[2], right[3]) * M_TO_FT
        if gap_ft < threshold_ft:
            continue
        issues.append(
            Issue(
                trail,
                slug,
                "profile_teleport",
                boundary,
                round(gap_ft),
                round(right[1] - left[1]),
            )
        )
    return issues


def audit(
    trail_query: str | None = None,
    min_cover: float = 0.55,
    gap_ft: float = DEFAULT_GAP_FT,
) -> tuple[list[Issue], int]:
    names = load_display_names()
    rows = load_selected_rows(min_cover)
    query = (trail_query or "").casefold()
    if query:
        rows = [
            row
            for row in rows
            if query in row["slug"].casefold()
            or query in row["name"].casefold()
            or query in names.get(row["slug"], "").casefold()
        ]

    issues = []
    for row in rows:
        trail = names.get(row["slug"], row["name"])
        profile = load_profile(row["slug"])
        if profile is None:
            issues.append(Issue(trail, row["slug"], "missing_profile", 0, 0))
            continue
        issues.extend(
            geometry_quality_issues(trail, row["slug"], profile, gap_ft)
        )
        issues.extend(
            profile_teleport_issues(trail, row["slug"], gap_ft, profile)
        )
    return issues, len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("trail", nargs="?", help="trail name or slug substring")
    parser.add_argument("--min-cover", type=float, default=0.55)
    parser.add_argument("--gap-feet", type=float, default=DEFAULT_GAP_FT)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    issues, count = audit(args.trail, args.min_cover, args.gap_feet)
    if args.json:
        json.dump([asdict(issue) for issue in issues], sys.stdout, indent=2)
        print()
    elif issues:
        print(f"Found {len(issues)} issues across {count} audited Bend trails:")
        for issue in issues:
            if issue.coverage is not None:
                detail = f"{issue.coverage:.1%} reference coverage"
            else:
                detail = f"{issue.gap_ft}ft geographic gap"
            if issue.elevation_jump_ft is not None:
                detail += f", {issue.elevation_jump_ft:+d}ft elevation jump"
            if issue.from_coord and issue.to_coord:
                detail += f", {issue.from_coord} -> {issue.to_coord}"
            print(f"  {issue.trail}: {issue.kind} at boundary {issue.boundary} ({detail})")
    else:
        print(f"No segment discontinuities across {count} audited Bend trails.")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
