import json
import unittest
from pathlib import Path

from fix_route_directions import orient_line_parts
from prepare_chattanooga_routes import ROUTE_SOURCES, build_route_feature

REPO_ROOT = Path(__file__).resolve().parents[1]
ROUTES_PATH = REPO_ROOT / "public/data/chattanooga/routes.geojson"


class PrepareChattanoogaRoutesTest(unittest.TestCase):
    def test_builds_route_and_repairs_short_alternate_path(self):
        main = [(-1, 1), (0, 0), (1, 0), (2, 1)]
        branch = [(0, 0), (0.5, 1), (1, 0)]

        feature, reversed_parts = build_route_feature(
            "test-route",
            [main, branch],
            lambda x, y: (x, y),
            source_feature_count=1,
            tolerance_meters=0.1,
        )

        self.assertEqual(reversed_parts, [1])
        self.assertEqual(feature["properties"], {
            "id": "test-route",
            "sourceFeatureCount": 1,
        })
        self.assertEqual(
            feature["geometry"]["coordinates"][1],
            [[1.0, 0.0], [0.5, 1.0], [0.0, 0.0]],
        )

    def test_committed_routes_are_complete_and_direction_consistent(self):
        collection = json.loads(ROUTES_PATH.read_text())
        features = collection["features"]

        self.assertEqual(
            [feature["properties"]["id"] for feature in features],
            [source.route_id for source in ROUTE_SOURCES],
        )
        for feature in features:
            parts = feature["geometry"]["coordinates"]
            copied = [[position[:] for position in part] for part in parts]
            self.assertEqual(orient_line_parts(copied), [])


if __name__ == "__main__":
    unittest.main()
