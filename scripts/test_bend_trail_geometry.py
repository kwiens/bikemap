import json
import math
import os
import tempfile
import unittest
from unittest.mock import patch

from align_bend_geometry import Way, match_trail
from audit_bend_trails import (
    geometry_quality_issues,
    profile_teleport_issues,
    source_gap_issues,
)
from build_bend_trails import (
    TraceResult,
    better_trace,
    build_trail,
    existing_profile_fallback,
    order_segments,
    profile_points_to_geometry,
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
    def test_existing_profile_fallback_is_explicitly_flagged(self):
        data = {
            "trail": "Missing Source",
            "distance": 100,
            "gain": 10,
            "loss": 5,
            "min": 4000,
            "max": 4010,
            "geometryGapDetails": [],
            "profile": [
                [0, 4000, -121.0, 44.0],
                [100, 4010, -120.999, 44.0],
            ],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            with open(
                os.path.join(temp_dir, "missing-source.json"),
                "w",
                encoding="utf-8",
            ) as fh:
                json.dump(data, fh)
            with patch("build_bend_trails.ELEV_DIR", temp_dir):
                fallback = existing_profile_fallback("missing-source")

        self.assertIsNotNone(fallback)
        self.assertEqual(fallback["geometry_coverage"], 0.0)
        self.assertEqual(fallback["geometry_source"], "existing-profile-fallback")

    def test_render_geometry_splits_at_profile_gap_boundaries(self):
        points = [
            [0, 4000, -121.0, 44.0],
            [100, 4010, -120.999, 44.0],
            [200, 4020, -120.998, 44.001],
            [300, 4030, -120.997, 44.001],
        ]
        details = [
            {
                "feet": 300,
                "from": [-120.999, 44.0],
                "to": [-120.998, 44.001],
            }
        ]

        geometry = profile_points_to_geometry(points, details)

        self.assertEqual(
            geometry,
            [
                [[-121.0, 44.0], [-120.999, 44.0]],
                [[-120.998, 44.001], [-120.997, 44.001]],
            ],
        )

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
    def test_match_trail_applies_fallback_tolerance_to_x_prefilter(self):
        reference_lng = -121.3
        reference_lat = 44.0
        offset_lng = 30 / (
            111320.0 * math.cos(math.radians(reference_lat))
        )
        reference = [
            [
                (reference_lng, reference_lat),
                (reference_lng, reference_lat + 0.001),
            ]
        ]
        way = Way(
            1,
            "Offset trail",
            None,
            [
                (reference_lng + offset_lng, reference_lat),
                (reference_lng + offset_lng, reference_lat + 0.001),
            ],
        )
        grid = {
            (int(reference_lng / 0.02), int(reference_lat / 0.02)): {way.id}
        }

        coverage, matches = match_trail(
            reference,
            {way.id: way},
            grid,
            tolerance_m=35.0,
        )

        self.assertEqual(coverage, 1.0)
        self.assertEqual([way_id for way_id, _share in matches], [way.id])

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

    def test_splits_trace_when_nearby_candidate_ways_are_disconnected(self):
        reference = [[(-121.0, 44.0), (-120.999, 44.0)]]
        ways = {
            1: [[-121.0, 44.0001], [-120.9995, 44.0001]],
            2: [[-120.9995, 43.9999], [-120.999, 43.9999]],
        }

        trace = trace_reference_path(reference, [1, 2], ways, tolerance_m=25)

        self.assertEqual(trace.coverage, 1.0)
        self.assertEqual(len(trace.segments), 2)
        self.assertEqual(len(trace.gaps_ft), 1)
        self.assertGreater(trace.gaps_ft[0], 50)

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
