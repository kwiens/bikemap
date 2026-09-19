#!/usr/bin/env python3
"""Convert Chattanooga's curated trail sources to import-ready GeoJSON.

The source archived from PR #67 is an ESRI shapefile in NAD83 / UTM zone 16N.
Payload stores ordinary WGS84 GeoJSON in its ``geom`` JSON field, so this
script reprojects every named feature, groups source pieces by ``Trail``, and
writes one MultiLineString feature per trail. A checked-in supplemental
FeatureCollection supplies permitted lines that are absent from the regional
shapefile; the converter merges it without knowing about individual trails.

Usage:

    python scripts/prepare_chattanooga_trails.py \
      /path/to/Chattanooga_Regional_Trails_4.shp

The sibling .dbf, .prj, and .cpg files must be present. Output defaults to
``public/data/chattanooga/trails.geojson`` and can be changed with ``--output``.
The supplemental input defaults to
``public/data/chattanooga/trails-supplemental.geojson``.

Both GeoJSON files are deprecated transition artifacts. Payload is the
authoritative runtime source; retain these files only until fresh-database
bootstrap and outage handling no longer depend on a public static fallback.
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
DEFAULT_SUPPLEMENTAL = (
    REPO_ROOT / "public/data/chattanooga/trails-supplemental.geojson"
)
COORDINATE_PRECISION = 7
SUPPORTED_SHAPE_TYPES = {
    shapefile.POLYLINE,
    shapefile.POLYLINEM,
    shapefile.POLYLINEZ,
}
DEPRECATED_DATASET_META = {
    "deprecated": True,
    "status": "staged-for-removal",
    "reason": "Payload is the authoritative trail source.",
    "removeWhen": (
        "Fresh databases bootstrap without this file and the runtime static "
        "fallback has been removed."
    ),
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
    supplemental_features = load_supplemental_features(args.supplemental.resolve())
    regional_trails = report["trails"]
    supplemental_parts = merge_supplemental_features(
        collection, supplemental_features
    )
    report["parts"] += supplemental_parts
    report["trails"] += len(supplemental_features)

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n"
    )

    print(
        f"Wrote {report['trails']} trails: {regional_trails} from "
        f"{report['source_records']} shapefile records and "
        f"{len(supplemental_features)} from {args.supplemental} "
        f"({report['parts']} line parts) to {output}"
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
    parser.add_argument(
        "--supplemental",
        type=Path,
        default=DEFAULT_SUPPLEMENTAL,
        help=f"Supplemental GeoJSON path (default: {DEFAULT_SUPPLEMENTAL})",
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

    collection = {
        "type": "FeatureCollection",
        "_meta": DEPRECATED_DATASET_META,
        "features": features,
    }
    report = {
        "blank_records": blank_records,
        "parts": sum(len(feature["geometry"]["coordinates"]) for feature in features),
        "source_records": source_records,
        "trails": len(features),
    }
    return collection, report


def load_supplemental_features(source: Path) -> list[dict]:
    """Read named MultiLineStrings that supplement the regional shapefile."""
    collection = json.loads(source.read_text())
    if (
        not isinstance(collection, dict)
        or collection.get("type") != "FeatureCollection"
        or not isinstance(collection.get("features"), list)
    ):
        raise ValueError(f"{source} is not a GeoJSON FeatureCollection.")

    features: list[dict] = []
    for index, feature in enumerate(collection["features"], start=1):
        if not isinstance(feature, dict):
            raise ValueError(f"{source} feature {index} is not a GeoJSON Feature.")
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        trail = properties.get("Trail") if isinstance(properties, dict) else None
        coordinates = (
            geometry.get("coordinates") if isinstance(geometry, dict) else None
        )
        if (
            feature.get("type") != "Feature"
            or not isinstance(trail, str)
            or not trail.strip()
            or not isinstance(geometry, dict)
            or geometry.get("type") != "MultiLineString"
            or not isinstance(coordinates, list)
            or not coordinates
            or any(not isinstance(part, list) or len(part) < 2 for part in coordinates)
        ):
            raise ValueError(f"{source} feature {index} is not a named MultiLineString.")
        features.append(feature)

    return features


def merge_supplemental_features(collection: dict, features: list[dict]) -> int:
    """Append supplemental trails, rejecting duplicate names."""
    existing = {
        feature["properties"]["Trail"] for feature in collection["features"]
    }
    supplemental_names: set[str] = set()
    for feature in features:
        trail = feature["properties"]["Trail"]
        if trail in existing or trail in supplemental_names:
            raise ValueError(f"Duplicate trail in supplemental GeoJSON: {trail}")
        supplemental_names.add(trail)

    collection["features"].extend(features)
    collection["features"].sort(key=lambda feature: feature["properties"]["Trail"])
    return sum(len(feature["geometry"]["coordinates"]) for feature in features)


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
