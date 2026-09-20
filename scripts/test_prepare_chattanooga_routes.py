import hashlib
import tempfile
import unittest
from pathlib import Path

from prepare_chattanooga_routes import build_route_feature, verify_source_files


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

    def test_verifies_every_shapefile_component(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "route.shp"
            contents = {".shp": b"geometry", ".prj": b"projection"}
            for suffix, content in contents.items():
                path.with_suffix(suffix).write_bytes(content)
            checksums = {
                suffix: hashlib.sha256(content).hexdigest()
                for suffix, content in contents.items()
            }

            verify_source_files(path, checksums)
            path.with_suffix(".prj").write_bytes(b"changed")

            with self.assertRaisesRegex(SystemExit, "Unexpected source checksum"):
                verify_source_files(path, checksums)

if __name__ == "__main__":
    unittest.main()
