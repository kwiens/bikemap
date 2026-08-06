# OSM trail editor

An online flow for curating trails: pick the OpenStreetMap ways a trail rides
on, press save, and the geometry, distance, elevation, and bounds are rebuilt
from OSM server-side. No Python, no local tooling, no drawing.

See [ADR-0001](../adr/0001-admin-ui-and-content-backend.md) for how this was
chosen.

**The public map now reads trails from Payload.** It still falls back to the
checked-in data in `src/data/` when there is no database, so the app runs fine
without one — see [Reading trails on the public map](#reading-trails-on-the-public-map).

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
pnpm db:seed:bend         # import Bend's 182 trails
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

## Reading trails on the public map

The map at `/` is a **server component**. It reads Payload through the Local API
— a typed function call, no HTTP hop — and passes the trails into the client map
as props:

```
app/(frontend)/page.tsx   getCityTrails(activeCityId)   ← Local API, revalidate 60
        ↓ props
HomeClient.tsx            setMountainBikeTrails(trails) ← during render
        ↓
data/trail-source.ts      getMountainBikeTrails()       ← what every consumer reads
```

Consumers call `getMountainBikeTrails()` rather than importing an array, because
a `const` binding would capture the checked-in data at import time and never see
the database rows. `utils/map.ts` builds its `trailByName` / `osmIdOwner` lookups
lazily for the same reason, and drops them when the list changes.

Geometry follows the same path: Bend's curated layer points at
`/api/map/trails?city=bend` instead of the static file.

### Seeding

One script per city, because their pipelines genuinely differ:

| | `pnpm db:seed:bend` | `pnpm db:seed:chattanooga` |
|---|---|---|
| Trails | 182 | 224 |
| Geometry | `public/data/bend/trails.geojson`, by slug | none — its lines live in a Mapbox tileset |
| `osmIds` | yes | none |
| `geometrySource` | `osm` — rebuildable from OSM | `imported` — the rebuild hook skips it |

**Only Bend is seeded by default.** Chattanooga doesn't fit the OSM-referenced
model yet, so importing it would add several hundred rows the editor can't
meaningfully work on. Run its script deliberately when you want them; whether
its trails *can* be matched to OSM ways is the open question in ADR-0001.

Both take `--dry-run`, and both pass `context.skipOsmRebuild` — without it the
`beforeChange` hook fires one Overpass request per row and gets the machine
rate-limited. Re-running either is safe: rows match on `(trailName, city)`.

### It degrades rather than breaks

`getCityTrails` **never throws**, and it distinguishes three outcomes so callers
don't confuse them:

| `status` | Meaning | API returns |
|---|---|---|
| `ok` | rows found | the FeatureCollection |
| `empty` | database answered; this city has none seeded | an empty FeatureCollection, 200 |
| `unavailable` | no `DATABASE_URL`, or the query failed | 503 |

`empty` is a real answer, not a failure — reporting it as 503 would send someone
debugging a database that is working fine.

In every no-rows case the client keeps the checked-in data, because
`setMountainBikeTrails` ignores an empty list. Losing the CMS must not take the
public map down with it.

**One gap:** that fallback covers trail *metadata*, not *geometry*. With the
database down, `/api/map/trails` returns 503 and Bend's curated lines won't
draw, even though the sidebar still lists them. Restoring a static-file fallback
for geometry is unfinished work.

### Cache

`revalidate = 60` on both the page and the API, so an edit in `/admin` is live
within a minute without a rebuild. Trail edits are rare and the payload is a few
hundred rows, so this serves a cached render and refreshes in the background
rather than hitting the database per request.

## Admin appearance

Two layers, so the common case needs no code:

1. **`src/app/(payload)/custom.css`** — the defaults. Sets CSS custom properties
   only, never Payload's own selectors, because variables are a supported
   surface and class names like `.btn__content` are internals that move between
   releases. It's unlayered while Payload's styles live in
   `@layer payload-default, payload`, so unlayered rules win and nothing needs
   `!important`.
2. **Settings → Theme** (`/admin/globals/theme`) — editable in the UI, stored in
   the database, injected by the admin layout as variables that override the
   stylesheet. Colour swatches, corner style, font, neutral tint, plus a custom
   CSS escape hatch.

Every theme field is optional: an unset field falls through to the stylesheet
default, so clearing a field is how you reset it.

**The one trick worth knowing:** `--theme-elevation-*` — the greys the whole UI
is built from — all resolve to a `--color-base-*` scale, and Payload derives
dark mode by *inverting* that scale. So retinting the base ramp once themes both
modes coherently, which is why "neutral tint" is a single setting rather than
two.

`customCss` is injected verbatim, so `sanitizeCss` strips `<` and `>` — a stray
`</style>` would otherwise turn styling into markup. It's admin-only, but
"trusted input" is exactly how injection bugs get written.

Like the trail reader, `getThemeCss` **never throws**: no database, an
unreachable one, or an unset global all return an empty string and the
stylesheet defaults stand. Nobody should be locked out of the admin by a theme
row.

## Reference collections

Two fields on a trail are dropdowns backed by their own collections rather than
free text or a hardcoded `select`, so their options are editable without a
deploy:

| Collection | What it is |
|---|---|
| **Trail complexes** | What trails group under — "Phil's Trail Complex", "Swampy Lakes" |
| **Organizations** | The clubs and agencies that maintain trails — COTA, SORBA |

The sidebar hierarchy is **region → trail complex → trail**, so a complex is the
middle level and `region` is a field on it.

Payload keeps both honest: renaming one updates every trail pointing at it, and
it blocks deleting one still in use. Editors read the lists; admins curate them.

`recArea` used to be free text, which meant a typo silently created a new
sidebar grouping that looked real.

### Trail complexes also move `region` out of code

The sidebar groups complexes into regions ("Bend", "Cascade Lakes"), and that
mapping was a hardcoded `REGION_MAP` per city — so adding a complex meant
editing TypeScript. It's now a field on the complex.

`regionOf(trail)` in `src/data/trail-region.ts` is what every grouping call site
uses: it prefers the stored region and falls back to the built-in map when there
isn't one. That keeps the checked-in data working unchanged while making the
database the source of truth where it has an answer. **Group by `regionOf`, not
`regionFor`** — the latter can't see the database.

The seed populates `region` from each city's `regionFor`, so the mapping arrives
already filled in rather than blank.

**Naming:** only the admin labels say "trail complex". The slug and table are
still `trail-areas`, and the app-level field is still `recArea` — renaming those
would mean a migration plus a sweep through the checked-in data files and the
Python scripts that write them, for no user-visible gain.

### City is hidden in the admin

A deployment serves one city, so the `city` picker is hidden on trails,
complexes, and organizations, defaulting to `activeCityId`. The column stays:
`getCityTrails` filters on it, the seeds set it per city, and editor access is
scoped by it. Removing `hidden` brings the picker back for a multi-city admin.

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
