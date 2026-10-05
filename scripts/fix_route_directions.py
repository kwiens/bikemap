#!/usr/bin/env python3
"""Detect and repair inconsistent directions in multipart route GeoJSON.

When two line parts form alternate paths between the same junctions, they must
run in opposite directions for arrows to circulate around the resulting loop.
This utility derives those relationships from geometry, solves all direction
constraints in a connected component, and reverses the least total distance.

Use ``--check`` in CI to reject source data that still needs normalization:

    python scripts/fix_route_directions.py routes.geojson --check

Write a corrected copy with ``--output`` or update the input with ``--in-place``:

    python scripts/fix_route_directions.py routes.geojson \
      --output routes.fixed.geojson
"""

from __future__ import annotations

import argparse
import copy
import json
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path

EARTH_RADIUS_M = 6_371_000.0
DEFAULT_TOLERANCE_METERS = 1.0

Position = list[float]
Line = list[Position]


class DirectionTopologyError(ValueError):
    """Raised when route direction constraints contradict one another."""


@dataclass(frozen=True)
class DirectionFix:
    feature: str
    reversed_parts: tuple[int, ...]


def main() -> None:
    args = parse_args()
    source = args.input.resolve()
    collection = json.loads(source.read_text())
    corrected, fixes = fix_feature_collection(
        collection,
        tolerance_meters=args.tolerance_meters,
    )

    for fix in fixes:
        indexes = ", ".join(str(index) for index in fix.reversed_parts)
        print(f"{fix.feature}: reverse part(s) {indexes}")

    if args.check:
        if fixes:
            raise SystemExit(
                f"{source} has {sum(len(fix.reversed_parts) for fix in fixes)} "
                "line part(s) with inconsistent loop direction"
            )
        print(f"{source}: route directions are consistent")
        return

    output = source if args.in_place else args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(corrected, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(f"Wrote {output}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Input GeoJSON FeatureCollection")
    parser.add_argument(
        "--tolerance-meters",
        type=float,
        default=DEFAULT_TOLERANCE_METERS,
        help=(
            "Maximum endpoint-to-line gap treated as a junction "
            f"(default: {DEFAULT_TOLERANCE_METERS})"
        ),
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if any line part needs reversal",
    )
    action.add_argument(
        "--output",
        type=Path,
        help="Write corrected GeoJSON to this path",
    )
    action.add_argument(
        "--in-place",
        action="store_true",
        help="Replace the input after successful normalization",
    )
    return parser.parse_args()


def fix_feature_collection(
    collection: dict,
    *,
    tolerance_meters: float = DEFAULT_TOLERANCE_METERS,
) -> tuple[dict, list[DirectionFix]]:
    """Return a corrected copy and an audit record of reversed parts."""
    if collection.get("type") != "FeatureCollection":
        raise ValueError("Expected a GeoJSON FeatureCollection")
    if tolerance_meters <= 0:
        raise ValueError("tolerance_meters must be positive")

    corrected = copy.deepcopy(collection)
    fixes: list[DirectionFix] = []

    for feature_index, feature in enumerate(corrected.get("features", [])):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "MultiLineString":
            continue
        parts = geometry.get("coordinates") or []
        reversed_parts = orient_line_parts(
            parts,
            tolerance_meters=tolerance_meters,
        )
        if reversed_parts:
            fixes.append(
                DirectionFix(
                    feature=feature_label(feature, feature_index),
                    reversed_parts=tuple(reversed_parts),
                )
            )

    return corrected, fixes


def orient_line_parts(
    parts: list[Line],
    *,
    tolerance_meters: float = DEFAULT_TOLERANCE_METERS,
) -> list[int]:
    """Orient alternate paths consistently and return reversed part indexes.

    A constraint is created when both endpoints of one part land on another
    part. If both currently travel between those junctions in the same
    direction, exactly one must be reversed. Components have two equivalent
    solutions, so the one reversing the least line length is selected.
    """
    constraints = direction_constraints(parts, tolerance_meters=tolerance_meters)
    if not constraints:
        return []

    adjacency: dict[int, list[tuple[int, int]]] = {
        index: [] for index in range(len(parts))
    }
    for left, right, parity in constraints:
        adjacency[left].append((right, parity))
        adjacency[right].append((left, parity))

    lengths = [line_length_m(part) for part in parts]
    assignments: dict[int, int] = {}

    for root in range(len(parts)):
        if root in assignments or not adjacency[root]:
            continue
        relative = {root: 0}
        queue = deque([root])
        component: list[int] = []

        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor, parity in adjacency[current]:
                expected = relative[current] ^ parity
                existing = relative.get(neighbor)
                if existing is not None and existing != expected:
                    raise DirectionTopologyError(
                        "Route has contradictory loop-direction constraints "
                        f"involving parts {current} and {neighbor}"
                    )
                if existing is None:
                    relative[neighbor] = expected
                    queue.append(neighbor)

        normal_cost = sum(lengths[index] for index in component if relative[index])
        inverted_cost = sum(
            lengths[index] for index in component if not relative[index]
        )
        invert = inverted_cost < normal_cost
        if math.isclose(normal_cost, inverted_cost, abs_tol=0.001):
            invert = bool(relative[min(component)])
        for index in component:
            assignments[index] = relative[index] ^ int(invert)

    reversed_parts = sorted(index for index, reverse in assignments.items() if reverse)
    for index in reversed_parts:
        parts[index].reverse()
    return reversed_parts


def direction_constraints(
    parts: list[Line],
    *,
    tolerance_meters: float = DEFAULT_TOLERANCE_METERS,
) -> list[tuple[int, int, int]]:
    """Return ``(left, right, xor)`` constraints between alternate paths."""
    constraints: list[tuple[int, int, int]] = []
    for left in range(len(parts)):
        if len(parts[left]) < 2:
            continue
        for right in range(left + 1, len(parts)):
            if len(parts[right]) < 2:
                continue
            parities = set()
            left_on_right = alternate_path_parity(
                parts[left], parts[right], tolerance_meters
            )
            if left_on_right is not None:
                parities.add(left_on_right)
            right_on_left = alternate_path_parity(
                parts[right], parts[left], tolerance_meters
            )
            if right_on_left is not None:
                parities.add(right_on_left)
            if len(parities) > 1:
                raise DirectionTopologyError(
                    "Ambiguous loop direction between parts "
                    f"{left} and {right}"
                )
            if parities:
                constraints.append((left, right, parities.pop()))
    return constraints


def alternate_path_parity(
    candidate: Line,
    reference: Line,
    tolerance_meters: float,
) -> int | None:
    """Return the flip XOR needed between two paths, or ``None`` if unrelated."""
    start_distance, start_measure = nearest_line_measure(candidate[0], reference)
    end_distance, end_measure = nearest_line_measure(candidate[-1], reference)
    if start_distance > tolerance_meters or end_distance > tolerance_meters:
        return None
    if abs(start_measure - end_measure) <= tolerance_meters:
        return None
    same_direction = start_measure < end_measure
    return int(same_direction)


def nearest_line_measure(point: Position, line: Line) -> tuple[float, float]:
    """Return distance to a line and distance-along-line of the nearest point."""
    best_distance = math.inf
    best_measure = 0.0
    cumulative = 0.0

    for start, end in zip(line, line[1:]):
        segment_length = distance_m(start, end)
        projection, fraction = project_to_segment(point, start, end)
        distance = distance_m(point, projection)
        if distance < best_distance:
            best_distance = distance
            best_measure = cumulative + segment_length * fraction
        cumulative += segment_length

    return best_distance, best_measure


def project_to_segment(
    point: Position,
    start: Position,
    end: Position,
) -> tuple[Position, float]:
    """Project a WGS84 point onto a short segment using local meter scales."""
    latitude = math.radians(point[1])
    meters_per_lon = 111_320.0 * math.cos(latitude)
    meters_per_lat = 110_574.0
    start_xy = (
        (start[0] - point[0]) * meters_per_lon,
        (start[1] - point[1]) * meters_per_lat,
    )
    end_xy = (
        (end[0] - point[0]) * meters_per_lon,
        (end[1] - point[1]) * meters_per_lat,
    )
    dx = end_xy[0] - start_xy[0]
    dy = end_xy[1] - start_xy[1]
    denominator = dx * dx + dy * dy
    if denominator == 0:
        fraction = 0.0
    else:
        fraction = max(
            0.0,
            min(1.0, -(start_xy[0] * dx + start_xy[1] * dy) / denominator),
        )
    return (
        [
            start[0] + (end[0] - start[0]) * fraction,
            start[1] + (end[1] - start[1]) * fraction,
        ],
        fraction,
    )


def line_length_m(line: Line) -> float:
    return sum(distance_m(start, end) for start, end in zip(line, line[1:]))


def distance_m(left: Position, right: Position) -> float:
    lat1 = math.radians(left[1])
    lat2 = math.radians(right[1])
    delta_lat = lat2 - lat1
    delta_lon = math.radians(right[0] - left[0])
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    value = min(1.0, max(0.0, value))
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def feature_label(feature: dict, feature_index: int) -> str:
    properties = feature.get("properties") or {}
    for key in ("id", "name", "Trail"):
        value = properties.get(key)
        if value:
            return str(value)
    return f"feature-{feature_index}"


if __name__ == "__main__":
    main()
