# Bend Bike Rides — curated trail list (reference data)

Source: [bendbikerides.com](https://bendbikerides.com) — a curated catalog of
mountain-bike trails in and around Bend / Central Oregon (~270 trails, "over
1,000 miles of singletrack").

**Purpose:** reference only. We use this curated *list of trails* (names, areas,
difficulty, length) to inform building our own dataset — we do not copy their
written content (descriptions, photos, etc.).

## How it was built

`scripts/scrape_bend_bike_rides.py` reads the site's `sitemap.xml` (270 `/trail/<slug>`
entries) and parses the complete trail record that each trail page embeds in its
server-rendered payload. One non-trail aggregate page (`/trail/complex`) is skipped,
leaving **269 trails**.

Re-run with: `python scripts/scrape_bend_bike_rides.py`

## Files

- `bend-bike-rides.csv` — one row per trail, the columns below.
- `bend-bike-rides.jsonl` — full record per trail, including the encoded `path`
  geometry (their custom polyline encoding) and raw fields. Use this if we want
  to recover geometry or fields not promoted to the CSV.

## Columns (CSV)

| Column | Notes |
|---|---|
| `slug`, `name`, `url` | trail id, display name, source page |
| `complex` | trail area / network it belongs to (e.g. Phil's Trail Complex, Oakridge). Blank if unassigned. |
| `difficulty` | `green` / `blue` / `black` / `double-black`. Comma-joined per segment for multi-segment trails. |
| `one_way` | `True` one-way, `False` two-way, `mixed` per-segment, blank if unspecified |
| `ebike_ok` | e-bikes permitted |
| `closed`, `closure` | whether currently closed; name(s) of any area closure |
| `segments` | number of path segments |
| `distance_m`, `distance_mi` | trail length (source is **meters**; miles derived) |
| `elev_gain_m`/`elev_loss_m` + `_ft` | climbing / descending (source meters; feet derived) |
| `elev_min_m`, `elev_max_m` | elevation bounds (meters) |
| `pois` | associated points of interest (`;`-joined) |
| `flag_lat`, `flag_lng` | representative map point |

Units note: the source stores distance and elevation in **meters**; the `_mi`/`_ft`
columns are our conversions.

## Aligning to OSM geometry

We render from OpenStreetMap, so each curated trail must be tied to its OSM
way(s). `scripts/align_bend_geometry.py` does this offline against the Oregon
Overpass cells already cached in `scripts/.osm_cache/` (read-only): it decodes
each trail's `path` (a HERE **flexible polyline**, precision 5, with a
3rd/elevation dim; multi-segment trails join pieces with `,`) and **map-matches**
it to OSM ways, assigning each sampled trail point to its nearest way within
25 m. Per trail it records `covered_frac` (geometric confidence) and the ordered
`osm_ids` the trail actually rides on. The decoded geometry is used **only as a
fingerprint to identify the OSM ways** — we render/measure from OSM, not from
their path.

Output: `data/bend-osm-match.csv`. Geometry matching recovers ways that are
**unnamed** in OSM (name matching can't) and surfaces the real OSM name when it
differs from the curated name (e.g. Horse Butte → "Coyote Loop Trail Number 62").
`osm_ids`/`osm_primary_name` are populated only for `strong`/`good` rows; weak
and none rows are blanked (their nearest way is the wrong far-away trail). Trails
that don't match are an **OSM tagging gap** — the singletrack lacks
`bicycle`/`mtb:scale` tags so the bike filter excludes it (e.g. Sisters /
Peterson Ridge) — not a tooling miss.
