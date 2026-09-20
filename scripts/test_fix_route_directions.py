import copy
import unittest

from fix_route_directions import (
    DirectionTopologyError,
    direction_constraints,
    fix_feature_collection,
    orient_line_parts,
)


class RouteDirectionTest(unittest.TestCase):
    def test_reverses_shorter_alternate_path_with_matching_direction(self):
        main = [[0.0, 1.0], [0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]
        branch = [[0.0, 0.0], [1.0, 1.0], [1.0, 0.0]]
        parts = [copy.deepcopy(main), copy.deepcopy(branch)]

        reversed_parts = orient_line_parts(parts, tolerance_meters=0.1)

        self.assertEqual(reversed_parts, [1])
        self.assertEqual(parts[0], main)
        self.assertEqual(parts[1], list(reversed(branch)))

    def test_leaves_opposing_alternate_paths_unchanged(self):
        parts = [
            [[0.0, 1.0], [0.0, 0.0], [1.0, 0.0], [2.0, 0.0]],
            [[1.0, 0.0], [1.0, 1.0], [0.0, 0.0]],
        ]

        self.assertEqual(orient_line_parts(parts, tolerance_meters=0.1), [])

    def test_uses_endpoint_to_segment_matches_not_only_shared_vertices(self):
        parts = [
            [[0.0, 0.0], [2.0, 0.0]],
            [[0.5, 0.0], [1.0, 1.0], [1.5, 0.0]],
        ]

        self.assertEqual(
            direction_constraints(parts, tolerance_meters=0.1),
            [(0, 1, 1)],
        )

    def test_rejects_contradictory_constraints(self):
        parts = [
            [[0.0, 0.0], [2.0, 0.0]],
            [[0.0, 0.0], [1.0, 1.0], [2.0, 0.0]],
            [[0.0, 0.0], [1.0, -1.0], [2.0, 0.0]],
        ]
        # Every pair travels from the same start to the same end. Requiring
        # every pair to oppose every other pair is impossible.
        with self.assertRaises(DirectionTopologyError):
            orient_line_parts(parts, tolerance_meters=0.1)

    def test_reports_feature_and_part_indexes(self):
        collection = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "test-loop"},
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": [
                            [
                                [-1.0, 1.0],
                                [0.0, 0.0],
                                [1.0, 0.0],
                                [2.0, 1.0],
                            ],
                            [[0.0, 0.0], [0.5, 1.0], [1.0, 0.0]],
                        ],
                    },
                }
            ],
        }

        corrected, fixes = fix_feature_collection(
            collection,
            tolerance_meters=0.1,
        )

        self.assertEqual(fixes[0].feature, "test-loop")
        self.assertEqual(fixes[0].reversed_parts, (1,))
        self.assertNotEqual(corrected, collection)
        self.assertEqual(
            collection["features"][0]["geometry"]["coordinates"][1][0],
            [0.0, 0.0],
        )


if __name__ == "__main__":
    unittest.main()
