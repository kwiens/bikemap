import unittest

from osm_trail_elevation import compute_elevation


def make_track(count, start_altitude, altitude_step):
    return [
        {
            "lng": -85.3 + i * 0.0003,
            "lat": 35.05 + i * 0.0003,
            "altitude": start_altitude + i * altitude_step,
        }
        for i in range(count)
    ]


class ComputeElevationTest(unittest.TestCase):
    def test_tracks_sustained_steep_climb(self):
        # Mirrors 'keeps tracking a sustained steep climb' in ride-stats.test.ts:
        # a monotone ~30% grade must not fabricate descent or sag below the summit.
        points = make_track(200, start_altitude=1000, altitude_step=10)

        gain, loss, min_elevation, max_elevation = compute_elevation(points)

        self.assertGreater(gain, 1900)
        self.assertLess(loss, 1)
        self.assertGreater(max_elevation - min_elevation, 1900)

    def test_bounds_damage_from_dropout_longer_than_cap(self):
        # Mirrors 'bounds the damage from a dropout longer than the cap':
        # 8 bogus ramping readings exceed ELEVATION_SPIKE_MAX_RUN, so the tail
        # is accepted; the leak must stay bounded well under the 240 m excursion.
        points = make_track(100, start_altitude=200, altitude_step=0)
        for i in range(40, 48):
            points[i]["altitude"] = 200 + (i - 40) * 30

        gain, loss, _min_elevation, max_elevation = compute_elevation(points)

        self.assertLess(gain, 120)
        self.assertLess(loss, 120)
        self.assertLess(max_elevation, 320)

    def test_still_replaces_isolated_spike(self):
        clean = make_track(200, start_altitude=1000, altitude_step=2)
        spiked = [dict(point) for point in clean]
        spiked[100]["altitude"] += 200

        _gain, _loss, _min_elevation, clean_max = compute_elevation(clean)
        _gain, _loss, _min_elevation, spiked_max = compute_elevation(spiked)

        self.assertLess(abs(spiked_max - clean_max), 20)


if __name__ == "__main__":
    unittest.main()
