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
    def test_tracks_sustained_climb_when_spike_ema_lags(self):
        points = make_track(200, start_altitude=1000, altitude_step=10)

        gain, _loss, min_elevation, max_elevation = compute_elevation(points)

        self.assertGreater(gain, 1700)
        self.assertGreater(max_elevation - min_elevation, 1700)

    def test_still_replaces_isolated_spike(self):
        clean = make_track(200, start_altitude=1000, altitude_step=2)
        spiked = [dict(point) for point in clean]
        spiked[100]["altitude"] += 200

        _gain, _loss, _min_elevation, clean_max = compute_elevation(clean)
        _gain, _loss, _min_elevation, spiked_max = compute_elevation(spiked)

        self.assertLess(abs(spiked_max - clean_max), 20)


if __name__ == "__main__":
    unittest.main()
