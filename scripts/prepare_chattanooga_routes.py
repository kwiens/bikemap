#!/usr/bin/env python3
"""Normalize Chattanooga's archived route shapefiles into WGS84 GeoJSON.

The route sources archived in PR #67 use several coordinate systems and split
some loops into multiple line parts. This converter reprojects each source,
deduplicates exact parts, and uses the topology-based direction normalizer so
alternate paths circulate consistently.

Usage:

    python scripts/prepare_chattanooga_routes.py \
      "/path/to/GIS/Uncompressed files"

Output defaults to ``public/data/chattanooga/routes.geojson``.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import shapefile
from pyproj import CRS, Transformer

from fix_route_directions import DEFAULT_TOLERANCE_METERS, orient_line_parts

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "public/data/chattanooga/routes.geojson"
COORDINATE_PRECISION = 7
SUPPORTED_SHAPE_TYPES = {
    shapefile.POLYLINE,
    shapefile.POLYLINEM,
    shapefile.POLYLINEZ,
}

Position = list[float]
Line = list[Position]
Project = Callable[[float, float], tuple[float, float]]


@dataclass(frozen=True)
class RouteSource:
    route_id: str
    relative_path: str


ROUTE_SOURCES = (
    RouteSource(
        "riverwalk-loop-v3-public",
        "RiverWalk_Loop_v3.1/OSM_RiverWalk_Loop_V3_1.shp",
    ),
)


def main() -> None:
    args = parse_args()
    source_root = args.source_root.resolve()
    features = []
    total_fixes = 0

    for source in ROUTE_SOURCES:
        path = source_root / source.relative_path
        require_shapefile(path)
        source_crs = CRS.from_wkt(path.with_suffix(".prj").read_text())
        transformer = Transformer.from_crs(
            source_crs,
            "EPSG:4326",
            always_xy=True,
        )
        parts, source_feature_count = read_source_parts(path)
        feature, reversed_parts = build_route_feature(
            source.route_id,
            parts,
            transformer.transform,
            source_feature_count=source_feature_count,
            tolerance_meters=args.tolerance_meters,
        )
        features.append(feature)
        total_fixes += len(reversed_parts)
        if reversed_parts:
            indexes = ", ".join(str(index) for index in reversed_parts)
            print(f"{source.route_id}: reversed part(s) {indexes}")

    collection = {"type": "FeatureCollection", "features": features}
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(
        f"Wrote {len(features)} routes with {total_fixes} direction fix(es) "
        f"to {output}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source_root",
        type=Path,
        help="Directory containing the uncompressed PR #67 route folders",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output GeoJSON path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--tolerance-meters",
        type=float,
        default=DEFAULT_TOLERANCE_METERS,
        help=(
            "Maximum endpoint-to-line gap treated as a junction "
            f"(default: {DEFAULT_TOLERANCE_METERS})"
        ),
    )
    return parser.parse_args()


def require_shapefile(path: Path) -> None:
    required = [path, path.with_suffix(".dbf"), path.with_suffix(".prj")]
    missing = [item for item in required if not item.exists()]
    if missing:
        raise SystemExit(
            "Missing required shapefile component(s): "
            + ", ".join(str(item) for item in missing)
        )


def read_source_parts(source: Path) -> tuple[list[list[tuple[float, float]]], int]:
    """Read every usable line part across all records in a shapefile."""
    encoding = "utf-8"
    cpg = source.with_suffix(".cpg")
    if cpg.exists() and cpg.read_text().strip():
        encoding = cpg.read_text().strip()

    reader = shapefile.Reader(str(source), encoding=encoding)
    parts: list[list[tuple[float, float]]] = []
    for shape in reader.iterShapes():
        if shape.shapeType not in SUPPORTED_SHAPE_TYPES:
            if shape.shapeType == shapefile.NULL:
                continue
            raise ValueError(
                f"Unsupported shape type {shape.shapeType} in {source}; "
                "expected a polyline"
            )
        stops = [*shape.parts, len(shape.points)]
        for start, end in zip(stops, stops[1:]):
            if end - start >= 2:
                parts.append(
                    [(point[0], point[1]) for point in shape.points[start:end]]
                )
    return parts, len(reader)


def build_route_feature(
    route_id: str,
    raw_parts: Iterable[Iterable[tuple[float, float]]],
    project: Project,
    *,
    source_feature_count: int,
    tolerance_meters: float = DEFAULT_TOLERANCE_METERS,
) -> tuple[dict, list[int]]:
    """Project and direction-normalize one route feature."""
    projected = [
        [round_position(project(x, y)) for x, y in part]
        for part in raw_parts
    ]
    parts = deduplicate_parts(part for part in projected if len(part) >= 2)
    reversed_parts = orient_line_parts(
        parts,
        tolerance_meters=tolerance_meters,
    )
    return (
        {
            "type": "Feature",
            "properties": {
                "id": route_id,
                "sourceFeatureCount": source_feature_count,
            },
            "geometry": {
                "type": "MultiLineString",
                "coordinates": parts,
            },
        },
        reversed_parts,
    )


def round_position(position: tuple[float, float]) -> Position:
    return [
        round(float(position[0]), COORDINATE_PRECISION),
        round(float(position[1]), COORDINATE_PRECISION),
    ]


def deduplicate_parts(parts: Iterable[Line]) -> list[Line]:
    unique: list[Line] = []
    seen: set[tuple[tuple[float, float], ...]] = set()
    for part in parts:
        key = tuple((position[0], position[1]) for position in part)
        if key not in seen:
            seen.add(key)
            unique.append(part)
    return unique


if __name__ == "__main__":
    main()
