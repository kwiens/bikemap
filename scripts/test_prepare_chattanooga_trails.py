import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from prepare_chattanooga_trails import (
    DEPRECATED_DATASET_META,
    build_feature_collection,
    load_supplemental_features,
    merge_supplemental_features,
)


class BuildFeatureCollectionTest(unittest.TestCase):
    def test_groups_parts_by_trail_and_skips_unnamed_records(self):
        rows = [
            {
                "properties": {
                    "Trail": "Trail A",
                    "Rec_Area": "Area 1",
                    "rating": "easy",
                    "Use_": "Hike Bike",
                },
                "parts": [[(10.12345678, 20.12345678), (11, 21)]],
            },
            {
                "properties": {
                    "Trail": "Trail A",
                    "Rec_Area": "Area 1",
                    "rating": "easy",
                    "Use_": "Hike Bike",
                },
                "parts": [[(12, 22), (13, 23)]],
            },
            {"properties": {"Trail": ""}, "parts": []},
        ]

        collection, report = build_feature_collection(rows, lambda x, y: (x, y))

        self.assertEqual(collection["_meta"], DEPRECATED_DATASET_META)
        self.assertEqual(report, {
            "blank_records": 1,
            "parts": 2,
            "source_records": 3,
            "trails": 1,
        })
        self.assertEqual(collection["features"], [
            {
                "type": "Feature",
                "properties": {
                    "Trail": "Trail A",
                    "Rec_Area": ["Area 1"],
                    "rating": ["easy"],
                    "Use_": ["Hike Bike"],
                    "sourceFeatureCount": 2,
                },
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [
                        [[10.1234568, 20.1234568], [11.0, 21.0]],
                        [[12.0, 22.0], [13.0, 23.0]],
                    ],
                },
            }
        ])

    def test_deduplicates_identical_parts(self):
        part = [(1, 2), (3, 4)]
        rows = [
            {"properties": {"Trail": "Trail A"}, "parts": [part, part]},
        ]

        collection, report = build_feature_collection(rows, lambda x, y: (x, y))

        self.assertEqual(report["parts"], 1)
        self.assertEqual(
            collection["features"][0]["geometry"]["coordinates"],
            [[[1.0, 2.0], [3.0, 4.0]]],
        )

    def test_loads_and_merges_supplemental_lines(self):
        with TemporaryDirectory() as directory:
            supplemental_path = Path(directory) / "supplemental.geojson"
            supplemental_path.write_text(json.dumps({
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {"Trail": "Trail B"},
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": [[[1, 2], [3, 4]]],
                    },
                }],
            }))
            features = load_supplemental_features(supplemental_path)

        collection, _ = build_feature_collection(
            [{"properties": {"Trail": "Trail A"}, "parts": [[(5, 6), (7, 8)]]}],
            lambda x, y: (x, y),
        )
        parts = merge_supplemental_features(collection, features)

        self.assertEqual(parts, 1)
        self.assertEqual(
            [feature["properties"]["Trail"] for feature in collection["features"]],
            ["Trail A", "Trail B"],
        )


if __name__ == "__main__":
    unittest.main()
