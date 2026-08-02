import unittest
from unittest.mock import patch

from scrape_bend_bike_rides import parse, slugs_from_sitemap


def trail_payload(location: str) -> str:
    return (
        'name:"Expressway",slug:"expressway",type:"trail",'
        'difficulty:$R[1]=["green"],oneWay:$R[2]=[!1],ebikeOkay:!0,'
        'closed:!1,distance:1821,elevation:$R[3]={min:1213.1,max:1232.5,'
        'avg:1223.4,gain:16,loss:21},segmentCount:1,'
        f'{location},path:$R[7]=["encoded-path"],alternatePaths:null}}}});'
    )


class ScrapeBendBikeRidesTest(unittest.TestCase):
    def test_uses_current_bounds_center_as_representative_point(self):
        html = trail_payload(
            'bounds:$R[4]=[$R[5]=[-121.4175,44.01307],'
            '$R[6]=[-121.39123,44.03411]]'
        )

        record = parse(html, "expressway")

        self.assertIsNotNone(record)
        self.assertAlmostEqual(record["flag_lng"], -121.404365)
        self.assertAlmostEqual(record["flag_lat"], 44.02359)

    def test_prefers_legacy_flag_point_when_both_formats_exist(self):
        html = trail_payload(
            'flagPoint:$R[4]=[-121.408,44.021],'
            'bounds:$R[5]=[$R[6]=[-121.4175,44.01307],'
            '$R[7]=[-121.39123,44.03411]]'
        )

        record = parse(html, "expressway")

        self.assertIsNotNone(record)
        self.assertEqual(record["flag_lng"], -121.408)
        self.assertEqual(record["flag_lat"], 44.021)

    def test_filters_non_trail_sitemap_routes(self):
        sitemap = """
        <loc>https://bendbikerides.com/trail/expressway</loc>
        <loc>https://bendbikerides.com/trail/complex</loc>
        <loc>https://bendbikerides.com/trail/map</loc>
        """
        with patch("scrape_bend_bike_rides.get", return_value=sitemap):
            slugs = slugs_from_sitemap()

        self.assertEqual(slugs, ["expressway"])


if __name__ == "__main__":
    unittest.main()
