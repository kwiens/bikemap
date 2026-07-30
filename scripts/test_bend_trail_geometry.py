import json
import os
import tempfile
import unittest
from unittest.mock import patch

from audit_bend_trails import (
    geometry_quality_issues,
    profile_teleport_issues,
    source_gap_issues,
)
from build_bend_trails import (
    TraceResult,
    better_trace,
    build_trail,
    order_segments,
    trace_reference_path,
)


class OrderSegmentsTest(unittest.TestCase):
    def test_expressway_prepends_shared_start_segment(self):
        long_way = [
            [-121.4058669, 44.0211503],
            [-121.402, 44.023],
            [-121.399277, 44.0256006],
        ]
        branch = [
            [-121.4058669, 44.0211503],
            [-121.409251, 44.026114],
        ]

        ordered = order_segments([long_way, branch])

        self.assertEqual(ordered, [branch[::-1], long_way])
        self.assertEqual(ordered[0][-1], ordered[1][0])

    def test_phils_trail_prepends_way_that_ends_at_chain_head(self):
        long_way = [
            [-121.437601, 44.0227838],
            [-121.41, 44.03],
            [-121.3855744, 44.0433092],
        ]
        branch = [
            [-121.485045, 44.022806],
            [-121.437601, 44.0227838],
        ]

        ordered = order_segments([long_way, branch])

        self.assertEqual(ordered, [branch, long_way])

    def test_pinedrops_preserves_real_gap_for_audit(self):
        long_way = [
            [-121.4726811, 44.0284379],
            [-121.48, 44.026],
            [-121.4905661, 44.0248519],
        ]
        branch = [
            [-121.471901, 44.0288358],
            [-121.4619737, 44.0317455],
        ]

        ordered = order_segments([long_way, branch])
        issues = source_gap_issues("Pinedrops", "pinedrops", ordered, 50)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].kind, "source_gap")
        self.assertEqual(issues[0].gap_ft, 251)


class ProfileAuditTest(unittest.TestCase):
    def test_detects_zero_distance_coordinate_teleport(self):
        data = {
            "profile": [
                [100, 4000, -121.4, 44.0],
                [100, 4065, -121.41, 44.01],
            ]
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            path = os.path.join(temp_dir, "expressway.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
            with patch("audit_bend_trails.ELEV_DIR", temp_dir):
                issues = profile_teleport_issues(
                    "Expressway", "expressway", threshold_ft=50
                )

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].elevation_jump_ft, 65)

    def test_flags_insufficient_reference_coverage(self):
        issues = geometry_quality_issues(
            "Bull Snake",
            "bull-snake",
            {"geometryCoverage": 0.75, "geometryGaps": []},
            threshold_ft=50,
        )

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].kind, "insufficient_geometry")
        self.assertEqual(issues[0].coverage, 0.75)


class ReferenceTraceTest(unittest.TestCase):
    def test_prefers_cleaner_trace_over_higher_tolerance_regression(self):
        clean = TraceResult([[[0, 0], [1, 1]]], 0.93, [])
        regressed = TraceResult([[[0, 0], [1, 1]]], 1.0, [3500])

        self.assertIs(better_trace(clean, regressed), clean)

    def test_snaps_reference_samples_to_osm_in_reference_order(self):
        reference = [[(0.0, 0.0), (0.001, 0.0), (0.002, 0.0)]]
        ways = {
            1: [[0.0, 0.00001], [0.001, 0.00001]],
            2: [[0.001, 0.00001], [0.002, 0.00001]],
        }

        trace = trace_reference_path(reference, [1, 2], ways)

        self.assertEqual(trace.coverage, 1.0)
        self.assertEqual(len(trace.segments), 1)
        self.assertEqual(trace.gaps_ft, [])
        self.assertAlmostEqual(trace.segments[0][0][1], 0.00001)

    def test_profile_distance_advances_across_a_known_gap(self):
        ways = {
            1: [[0.0, 0.0], [0.001, 0.0]],
            2: [[0.002, 0.0], [0.003, 0.0]],
        }
        with patch("build_bend_trails.elevation_at", return_value=100.0):
            built = build_trail([1, 2], ways)

        self.assertIsNotNone(built)
        self.assertEqual(len(built["geometry_gaps_ft"]), 1)
        duplicate_distances = [
            (left, right)
            for left, right in zip(built["profile"], built["profile"][1:])
            if left[0] == right[0] and left[2:] != right[2:]
        ]
        self.assertEqual(duplicate_distances, [])


if __name__ == "__main__":
    unittest.main()
