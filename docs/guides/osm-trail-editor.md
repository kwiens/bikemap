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
- **Derived from OSM** — a collapsed, read-only panel with the build report,
  distance, elevation, bounds, and geometry. Hand edits would be overwritten on
  the next save, which is why it's read-only.
- **Rebuild geometry** — force a refresh when a trail changed upstream.

The build report is the important one. Referencing OSM has real failure modes,
and they're silent unless surfaced:

- a way was **deleted or renumbered** upstream → listed as missing, the trail is
  still built from the rest
- the picked ways **don't connect** → kept as separate parts with the gap
  measured, rather than a piece being quietly dropped
- **Overpass was busy** → the previous geometry is kept and the save still
  succeeds; save again to retry

## Accuracy

Rebuilding Bend's Cole Loop from its three way ids, against what the Python
pipeline produced:

| | Python | This | |
|---|---|---|---|
| min elevation (ft) | 2917 | 2917 | ✅ |
| max elevation (ft) | 4079 | 4083 | ✅ |
| distance (mi) | 10.42 | 11.66 | ⚠️ +12% |

Elevation matches, which confirms the DEM sampling and unit conversion. The
distance gap is **a difference in definition, not a bug**, and it's the main
open question in this design:

- `build_bend_trails.py` traces an external reference polyline onto OSM, so it
  uses only the *portion* of each way the curated trail covers.
- This uses **whole ways** — there's no reference polyline in an online flow,
  because the editor is the reference.

Measured across a sample of 9 Bend trails, **7 matched within 0%**: for most
trails the whole ways *are* the trail, because OSM splits ways at junctions.
Cole Loop (+12%) and Tumalo Creek (−10%) are the exceptions.

**The fix, when it's needed:** let an editor click a start and end point to trim
the first and last way (`turf.lineSlice` or equivalent). Not built yet.

## Things that will trip you up

- **The project is ESM** (`"type": "module"`) — Payload 3's CLI requires it. New
  root config files must be ESM or `.cjs`.
- **Don't add a route at `/api/<collection-name>`.** Payload mounts its REST API
  there, so `/api/trails` would shadow the trails collection's list endpoint.
- **`graphql` is pinned to v16.** Payload peer-depends on `^16.8.1`; a fresh
  install pulls 17.
- **Overpass is a shared community endpoint.** It rate-limits (429) and sheds
  load (504) routinely — the client retries with backoff, and it's easy to get
  temporarily blocked when scripting bulk requests. Point `--overpass-url` style
  overrides at a private instance for anything bulk.
- **`push` is off.** Schema changes go through `pnpm db:migrate:create`; re-run
  `pnpm generate:types` after a collection change and commit both.
- **Re-run `pnpm generate:importmap`** after adding or renaming an admin
  component, or Payload won't find it.
- **Generated, lint-excluded**: `src/payload-types.ts`, `src/migrations/`,
  `src/app/(payload)/admin/importMap.js`.

## Not built yet

- **Trimming ways** to a start/end point — see Accuracy above.
- **Trails not in OSM.** Every trail must be mapped upstream first. Brand-new or
  deliberately unmapped trails need either an OSM edit or a local-geometry
  escape hatch.
- **Migrating the existing 406 trails.** Chattanooga's trails have no `osmIds`
  at all — they render from a Mapbox Studio tileset. Whether they can move to
  this model is an open question worth testing with
  `scripts/align_bend_geometry.py` against Tennessee.
- **Serving the map from the database.** Still reads `src/data/`.
