# Chattanooga GIS import

The regional mountain-bike geometry archived from
[PR #67](https://github.com/kwiens/bikemap/pull/67) is permitted for use in this
project. The raw trail shapefile stays outside the application repository; its
normalized WGS84 trail GeoJSON remains the checked-in public fallback. Curated
route geometry takes a stricter path: normalize it directly into Payload and
do not commit the generated coordinates.

## Canonical input

Use the `Chattanooga_Regional_Trails_4` shapefile set dated 2026-04-09. The
required components and SHA-256 checksums are:

| File | SHA-256 |
|---|---|
| `Chattanooga_Regional_Trails_4.shp` | `83e844b759dc34d35fca207396479957491d0d3f0f2ef72930cba38f927ad2d2` |
| `Chattanooga_Regional_Trails_4.shx` | `8c9a3a1a835d379651bd592cc05f45d0513d5d0e2fb321ecea5420218676cd3a` |
| `Chattanooga_Regional_Trails_4.dbf` | `d1f292db756972ca50112cbc7deceb5c2d0a42a0d2fdebfade55276d649d874c` |
| `Chattanooga_Regional_Trails_4.prj` | `2b085fa42af77cb88c9a175d5b20c99ac21e388de6dc87b33a165be38e9264a8` |
| `Chattanooga_Regional_Trails_4.cpg` | `3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824` |

The ArcGIS metadata is preserved in the source bundle but is not required by
the converter.

## Prepare and import

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/prepare_chattanooga_trails.py \
  /path/to/Chattanooga_Regional_Trails_4.shp

docker compose up -d
pnpm db:migrate
pnpm db:seed:chattanooga
```

The converter reads the projection from `.prj`, transforms NAD83 / UTM zone
16N to WGS84, groups split features by their raw `Trail` value, removes exact
duplicate line parts, and writes
`public/data/chattanooga/trails.geojson` deterministically.

The source contains 320 records. The generated file contains 224 named
MultiLineStrings and 397 line parts. Of the app's 224 curated trails, 218 match
by exact `Trail` name and import with geometry. The six without geometry are:

- Godsey Ridge Blue 1
- Godsey Ridge Blue 2
- Godsey Ridge Expert 1
- Godsey Ridge Expert 2
- Godsey Ridge Expert Spur
- Godsey Ridge Green

Those six are expected: they render from the separate `Godsey Ridge Trails`
layer baked into the Chattanooga Mapbox style. The regional source also has six
named geometries not represented in the curated sidebar (`River Walk`, `South
Chick Greenway`, `South Chickamauga Creek Greenway`, `Tennessee Riverwalk`,
`Valley`, and `unmaintained`). The map's curated-name filter prevents them from
appearing as orphan lines; the seed ignores them because no matching trail row
exists.

Imported Chattanooga rows use `geometrySource: 'imported'`. They keep the
archived line until a curator draws a replacement or the trail is matched to
OSM way ids. Bulk seeding passes `context.skipOsmRebuild`, so it never sends an
Overpass request per row.

## Curated route geometry

Riverwalk Loop is normalized from its route shapefile in the same PR #67
archive. It is the only route migrated here because its archived geometry was
verified against the current Studio tileset; several other Studio routes have
newer geometry than the archive.

| Route source (`GIS/Uncompressed files/RiverWalk_Loop_v3.1/…`) | SHA-256 |
|---|---|
| `OSM_RiverWalk_Loop_V3_1.cpg` | `3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824` |
| `OSM_RiverWalk_Loop_V3_1.dbf` | `3bcc134651d0bf0159f2e63fcc6ebddf0332a13e9f2abf4c0c2ccb6d757cd1b7` |
| `OSM_RiverWalk_Loop_V3_1.prj` | `f2e7fb14d55bdd8d6a3bc2c272a48729d8f9d0ad72936e20eae6a9a81c2fccd0` |
| `OSM_RiverWalk_Loop_V3_1.shp` | `ef797a83b5a630747faa0f32ca16956b989fa5877d929313b1847657e1a98460` |
| `OSM_RiverWalk_Loop_V3_1.shx` | `60349a0c0cacd4817330aa390de2d0d794c9aa31bc026f68fd41bbf1b8d07b33` |

```bash
pnpm db:import:chattanooga-routes \
  "/path/to/GIS/Uncompressed files"
```

The importer invokes `prepare_chattanooga_routes.py`, verifies every component
of the archived shapefile, normalizes it in memory, and upserts the result into
Payload's `routes` collection. No generated route coordinates are written
under `public/` or committed to Git. The database row keeps the existing
`BikeRoute.id`, so route selection and styling continue to use the same public
identifier.

The public map reads `/api/map/routes?city=chattanooga`. Payload is the sole
Riverwalk geometry source: the same-named Studio layer stays disabled whether
the endpoint returns geometry, is empty, or is unavailable. Run the migration
and import before relying on the route in an environment.

Multipart route direction is normalized by `scripts/fix_route_directions.py`.
When two parts form alternate paths between the same junctions, the paths must
run in opposite directions. The utility solves those relationships together
and reverses the least total distance, avoiding route-specific coordinate
exceptions. To inspect or independently check the normalized output, write it
to a temporary file explicitly:

```bash
python scripts/prepare_chattanooga_routes.py \
  "/path/to/GIS/Uncompressed files" --output /tmp/chattanooga-routes.geojson
python scripts/fix_route_directions.py \
  /tmp/chattanooga-routes.geojson --check
```

The current source normalization reverses the four-point 5th/Lookout branch of
Riverwalk Loop while leaving its 556-point main path unchanged.

## Other PR #67 datasets

The app has dedicated database collections for curated mountain-bike trails
and routes, not for every GIS layer in the archive. Do not coerce unrelated
data into either collection:

| Source group | Intended treatment |
|---|---|
| TPL full and filtered trail inventories | Preserve as reference/network data; mixed-use and hiking records need a separate network-segment model. |
| Riverwalk Loop route file | Normalize and import into Payload's `routes` collection; display metadata remains in `BikeRoute`. |
| Zoo, Riverwalk Greenway, Cherokee, Moccasin Bend, and South Chickamauga route files | Keep their newer Studio geometry until each current source is archived and verified. |
| Bike Chattanooga station snapshot | Do not seed as current availability; the app already reads live GBFS. Keep only as a dated reference snapshot. |
| Traffic garden points | Candidate geometry for a future map-features collection. |
| Godsey–Waldens connection | Preserve as an unmapped route candidate until its product/route identity is decided. |

This division is intentional: “ready to import” means the data matches a real
collection contract, not merely that every source file can be inserted into a
JSON column.
