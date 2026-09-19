#!/usr/bin/env python3
"""Convert Chattanooga's regional trail shapefile to import-ready GeoJSON.

The source archived from PR #67 is an ESRI shapefile in NAD83 / UTM zone 16N.
Payload stores ordinary WGS84 GeoJSON in its ``geom`` JSON field, so this
script reprojects every named feature, groups source pieces by ``Trail``, and
writes one MultiLineString feature per trail.

Usage:

    python scripts/prepare_chattanooga_trails.py \
      /path/to/Chattanooga_Regional_Trails_4.shp

The sibling .dbf, .prj, and .cpg files must be present. Output defaults to
``public/data/chattanooga/trails.geojson`` and can be changed with ``--output``.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Callable, Iterable

import shapefile
from pyproj import CRS, Transformer

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "public/data/chattanooga/trails.geojson"
COORDINATE_PRECISION = 7
SUPPORTED_SHAPE_TYPES = {
    shapefile.POLYLINE,
    shapefile.POLYLINEM,
    shapefile.POLYLINEZ,
}

Position = list[float]
Line = list[Position]
Project = Callable[[float, float], tuple[float, float]]


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    required = [source, source.with_suffix(".dbf"), source.with_suffix(".prj")]
    missing = [path for path in required if not path.exists()]
    if missing:
        raise SystemExit(
            "Missing required shapefile component(s): "
            + ", ".join(str(path) for path in missing)
        )

    source_crs = CRS.from_wkt(source.with_suffix(".prj").read_text())
    transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    rows = read_source_rows(source)
    collection, report = build_feature_collection(rows, transformer.transform)

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n"
    )

    print(
        f"Wrote {report['trails']} trails from {report['source_records']} source "
        f"records ({report['parts']} line parts) to {output}"
    )
    if report["blank_records"]:
        print(f"Skipped {report['blank_records']} unnamed/null source records.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the source .shp file")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output GeoJSON path (default: {DEFAULT_OUTPUT})",
    )
    return parser.parse_args()


def read_source_rows(source: Path) -> list[dict]:
    """Read only the fields and line parts the importer needs."""
    encoding = "utf-8"
    cpg = source.with_suffix(".cpg")
    if cpg.exists() and cpg.read_text().strip():
        encoding = cpg.read_text().strip()

    reader = shapefile.Reader(str(source), encoding=encoding)
    field_names = [field[0] for field in reader.fields[1:]]
    rows: list[dict] = []

    for item in reader.iterShapeRecords():
        properties = dict(zip(field_names, item.record, strict=True))
        shape = item.shape
        parts: list[list[tuple[float, float]]] = []
        if shape.shapeType in SUPPORTED_SHAPE_TYPES:
            stops = [*shape.parts, len(shape.points)]
            for start, end in zip(stops, stops[1:]):
                if end - start >= 2:
                    parts.append([(point[0], point[1]) for point in shape.points[start:end]])
        elif shape.shapeType != shapefile.NULL:
            raise ValueError(
                f"Unsupported shape type {shape.shapeType} in record "
                f"{len(rows) + 1}; expected a polyline."
            )

        rows.append({"parts": parts, "properties": properties})

    return rows


def build_feature_collection(
    rows: Iterable[dict], project: Project
) -> tuple[dict, dict[str, int]]:
    """Group source records by trail and return WGS84 MultiLineStrings."""
    grouped: dict[str, list[Line]] = defaultdict(list)
    areas: dict[str, set[str]] = defaultdict(set)
    ratings: dict[str, set[str]] = defaultdict(set)
    uses: dict[str, set[str]] = defaultdict(set)
    source_counts: dict[str, int] = defaultdict(int)
    source_records = 0
    blank_records = 0

    for row in rows:
        source_records += 1
        properties = row["properties"]
        trail = str(properties.get("Trail") or "").strip()
        parts = row["parts"]
        if not trail or not parts:
            blank_records += 1
            continue

        source_counts[trail] += 1
        add_value(areas[trail], properties.get("Rec_Area"))
        add_value(ratings[trail], properties.get("rating"))
        add_value(uses[trail], properties.get("Use_"))

        for part in parts:
            projected = [round_position(project(x, y)) for x, y in part]
            if len(projected) >= 2:
                grouped[trail].append(projected)

    features = []
    for trail in sorted(grouped):
        parts = deduplicate_parts(grouped[trail])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "Trail": trail,
                    "Rec_Area": sorted(areas[trail]),
                    "rating": sorted(ratings[trail]),
                    "Use_": sorted(uses[trail]),
                    "sourceFeatureCount": source_counts[trail],
                },
                "geometry": {"type": "MultiLineString", "coordinates": parts},
            }
        )

    collection = {"type": "FeatureCollection", "features": features}
    report = {
        "blank_records": blank_records,
        "parts": sum(len(feature["geometry"]["coordinates"]) for feature in features),
        "source_records": source_records,
        "trails": len(features),
    }
    return collection, report


def add_value(target: set[str], value: object) -> None:
    text = str(value or "").strip()
    if text:
        target.add(text)


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
