# OSM trail editor

An online flow for curating trails: pick the OpenStreetMap ways a trail rides
on, press save, and the geometry, distance, elevation, and bounds are rebuilt
from OSM server-side. No Python, no local tooling, no drawing.

See [ADR-0001](../adr/0001-admin-ui-and-content-backend.md) for how this was
chosen.

**Status: working spike.** The public map still renders from the TypeScript data
in `src/data/`; nothing here is load-bearing yet, and the app runs fine without a
database.

## The idea

**A trail does not own its geometry — it references it.**

```ts
{ displayName: 'Cole Loop', recArea: 'Bend Area', rating: 'intermediate',
  osmIds: [438938540, 438942588, 692052468] }
```

Everything else is derived. That's the whole design, and it follows what
`scripts/build_bend_trails.py` already established for Bend: geometry comes from
OSM, we curate the names, ratings, and groupings on top.

What it buys:

| | Owning the geometry | Referencing OSM |
|---|---|---|
| Add a trail | draw the whole line | click the ways |
| Trail gets rerouted | redraw it | tick "rebuild" and save |
| Fix a wrong line | edit your copy | fix it in OSM — everyone benefits |
| Storage | a source of truth to protect | a cache you can rebuild |

## Running it

```bash
docker compose up -d      # Postgres on :5432
pnpm db:migrate           # create the schema
pnpm dev                  # /admin — first visit creates the admin user
```

Needs `DATABASE_URL`, `PAYLOAD_SECRET`, and `NEXT_PUBLIC_MAPBOX_TOKEN` in
`.env.local` (see `.env.example`). The Mapbox token is what samples elevation;
without it a trail still gets geometry and distance, just no climb figures.

## How a save works

`resolveOsmGeometry` (`src/payload/hooks/resolveOsmGeometry.ts`) runs
`beforeChange` on every trail:

```
osmIds ──> fetchWaysByIds ──> assembleWays ──> sampleTerrain ──> stored fields
           (Overpass)         (join + gaps)    (Terrain-RGB)     geom, distance,
                                                                 elevation*, bounds,
                                                                 osmReport
```

| Module | Job |
|---|---|
| `osm/overpass.ts` | Fetch full-resolution ways by id, with retry/backoff |
| `osm/assemble.ts` | Join ways end to end; report gaps rather than hide them |
| `osm/terrain.ts` | Sample Mapbox Terrain-RGB (via `sharp`, since Node has no canvas) |
| `osm/build.ts` | Orchestrate the above into one `BuiltTrail` |

It is **server-authoritative**: the admin suggests way ids, but every stored
number is computed here, not accepted from the browser.

Overpass is only called when the ways actually change (or when **Rebuild
geometry** is ticked). An unrelated edit — fixing a typo in the name — re-saves
in ~30 ms instead of ~8 s.

### Why Overpass and not the vector tiles

The map already renders OSM trails from a vector tileset, and the picker uses it
for instant feedback. But tile geometry is simplified and clipped at tile
boundaries, so what gets *stored* comes from Overpass. This is the same choice
`scripts/osm_trail_elevation.py` documents.

## What the editor sees

- **OSM ways** — the map picker. Click a trail to add it, click again to remove.
  Order matters for trails that double back, so pick them in riding order.
- **Derived from OSM** — read-only build report, distance, elevation, bounds.
- **Rebuild geometry** — force a refresh when a trail changed upstream.

The build report is the important one, because referencing OSM has real failure
modes and they are silent unless surfaced:

| What happened | What you get |
|---|---|
| A way was deleted or renumbered upstream | listed as missing; the trail still builds from the rest |
| The picked ways don't connect | kept as separate parts, with the gap measured |
| Overpass was busy | previous geometry kept, save still succeeds — save again to retry |

## Accuracy

Bend's Cole Loop rebuilt from its three way ids, against the Python pipeline:

| | Python | This |
|---|---|---|
| min elevation (ft) | 2917 | 2917 |
| max elevation (ft) | 4079 | 4083 |
| distance (mi) | 10.42 | 11.66 |

Elevation matching confirms the DEM sampling and unit conversion. The distance
gap is **a difference in definition, not a bug**: `build_bend_trails.py` traces a
reference polyline and uses only the portion of each way a trail covers, while
this uses whole ways — an online editor has no reference polyline, because the
editor *is* the reference.

Across 9 sampled Bend trails 7 matched within 0%, because OSM splits ways at
junctions. Cole Loop (+12%) and Tumalo Creek (−10%) are the exceptions. The fix,
when needed: let an editor click a start and end point to trim the first and last
way.

## Things that will trip you up

The full list lives in [CLAUDE.md](../../CLAUDE.md); this is the one that costs
the most time to diagnose.

**The app has no root layout, on purpose.** Payload's `RootLayout` renders its
own `<html>`/`<body>`, so the public app lives in `src/app/(frontend)/` with its
own. A layout at `src/app/` nests a second `<html>` inside Payload's, and the
symptom is not a crash — the admin renders and its inputs silently stop
accepting clicks. `favicon.ico` and `manifest.ts` stay at `src/app/`, since Next
resolves metadata files from the app root.

## Not built yet

- **Trimming ways** to a start/end point — see Accuracy.
- **Trails not in OSM.** Every trail must be mapped upstream first; brand-new or
  deliberately unmapped ones need an OSM edit or a local-geometry escape hatch.
- **Migrating Chattanooga's 220 trails.** They have no `osmIds` and render from
  a Mapbox tileset. Worth testing with `scripts/align_bend_geometry.py` against
  Tennessee.
- **Serving the map from the database.** Still reads `src/data/`.
