# ADR-0001 — CMS for map content

- **Status:** Accepted, after two spikes reversed the original recommendation
- **Date:** 2026-08-04

Moving map content (routes, trails, POIs, shops) out of TypeScript files into
Postgres, with an admin UI on top.

## Decision

**Payload 3, running inside the Next app. Geometry is referenced from OSM and
cached as `jsonb` — no PostGIS.**

The reasoning that got here is not the reasoning we started with, so in short:

- A trail **references the OSM ways it rides on**; geometry, distance, elevation
  and bounds are rebuilt from Overpass + Terrain-RGB on save. See
  [the guide](../guides/osm-trail-editor.md).
- Because the line is derived, it is a **cache, not a source of truth** — which
  removes the geometry-storage problem that this ADR was originally about.
- Payload's admin covers login, roles, drafts, versions, and audit; the custom
  parts are React components inside it.

## What we judged on

| | Criterion | Why |
|---|---|---|
| C1 | **Real PostGIS geometry** | Assumed at the time to be essential — spike 2 showed it isn't. |
| C2 | **We control the schema** | We write the migrations; the ORM must not get in the way. **Avoid Prisma** — it can't read or write geometry columns. |
| C3 | **Services added** | Fork-and-deploy: anything we add, every forker has to run. |
| C4 | **Reuse our React components** | The map and elevation chart exist. "It's React" isn't enough — an admin that builds separately can't import them. |
| C5 | **Roles, drafts, revisions** | Replaces what GitHub PRs give us today. |
| C6 | **Free software** | Our code is GPLv3. MIT and BSD are fine; source-available and paid tiers are not. |

## Options

| | Directus | Payload | Strapi | Keystone | AdminJS | Build our own |
|---|---|---|---|---|---|---|
| C1 geometry | ✅ best | ⚠️ needs work | ⚠️ plugin | ❌ Prisma | ✅ data, ❌ UI | ✅ |
| C2 our schema | ✅ | ⚠️ Payload writes it | ❌ | ⚠️ Prisma | ✅ | ✅ |
| C3 services | +1 | none | +1 | none | no Next support | none |
| C4 our components | ❌ Vue | ✅ | ✅ | ✅ | ❌ React 18 | ✅ |
| C5 roles/drafts | ✅ | ✅ | 💰 paid | ✅ | ❌ | ❌ |
| C6 free software | ❌ | ✅ MIT | ⚠️ paid roles | ✅ MIT | ✅ MIT | ✅ |
| Edits lines out of the box | ✅ | ❌ | ⚠️ plugin | ❌ | ❌ | ❌ |

**Ruled out:** Directus (C6 — BSL 1.1, source-available), Strapi (C2 — its
builder owns the schema; C6 — paid roles), Keystone (C1 — Prisma), AdminJS
(C4 — React 18, no Next support, a year-old 0.1.x adapter).

Directus is the loss worth naming: it has the best PostGIS support here and the
only out-of-the-box line editor. The license rules it out.

That left **Payload or building our own**.

## How the decision changed

The first pass recommended **building our own**, on the grounds that this is a
map tool rather than forms over a database: trails *are* geometry, so the hard
parts would be custom under any CMS, and generated CRUD is worth little across
six tables.

Two spikes changed that.

### Spike 1 — Payload with real PostGIS (`feat/payload-postgis`)

Trail geometry as a real `geometry(MultiLineString,4326)` column, swapped in via
`afterSchemaInit`. **It worked**, and the predicted problems mostly didn't
happen: Payload's migration generator emitted the swapped type and the GiST
indexes unprompted; geometry saved inside Payload's transaction and landed in
version history; spatial reads cut a city's GeoJSON from 1.78 MB to 58 KB.

**Abandoned anyway** — none of that capability was needed. Serving a city's
trails is simpler from jsonb (it's already GeoJSON), the scripts already compute
`ST_Length`/`ST_Extent`, nearest-trail runs client-side with every trail loaded,
and rendering is Mapbox Studio rather than `ST_AsMVT`. The cost was a
hand-written 230-line Drizzle `customType` with an EWKB parser plus 188 lines of
tests — the piece least worth maintaining for capability the app doesn't use.

> If spatial querying is ever wanted: `jsonb` plus a
> `GENERATED ALWAYS AS (ST_GeomFromGeoJSON(geom_json)) STORED` column gets every
> spatial capability with **no** custom type. Verified on PostGIS 3.4 — the
> function is `IMMUTABLE`, GiST indexes the generated column, direct writes are
> refused, invalid GeoJSON is rejected at insert.

### Spike 2 — OSM-referenced trails (`feat/osm-trail-builder`)

The insight that made spike 1 moot: **for a bike map the geometry is already
mapped, in OSM.** Bend's Python pipeline had established this offline; spike 2
makes it an online flow.

Verified end to end: a name and three OSM way ids produced an 11.66 mi,
897-vertex MultiLineString with elevation and bounds, no geometry authored by
hand. Elevation matched the Python pipeline (min 2917/2917 ft, max 4079/4083 ft).

What it changes:

- **Geometry stops being authored, so it stops being the hard part.** No drawing
  tool, no PostGIS, no geometry worth protecting.
- **The editor is a way-picker**, which fits inside Payload as a custom field.
- **Fixes go upstream.** A curator correcting a line edits OSM, and every
  consumer benefits — which suits this project's copyleft intent.
- **It deletes a recurring failure.** Chattanooga renders from a Mapbox tileset
  that keeps getting renamed upstream; unifying on OSM removes that.

With geometry no longer the deciding factor, Payload's admin is worth more than
what it costs, and "build our own" loses its case.

## Still open

The spikes don't settle the original question, which was never really about
geometry: **who edits the curation layer?** If editing stays with maintainers,
files plus PRs remains legitimate. A CMS earns its place when non-maintainers set
names and ratings without a GitHub account.

Two testable unknowns:

1. **Whole ways vs trimmed ways.** The Python pipeline traced a reference
   polyline and used only the covered portion; an online editor picks whole ways.
   7 of 9 sampled Bend trails matched within 0%, but Cole Loop ran 12% long and
   Tumalo Creek 10% short. A trim control closes this.
2. **Does Chattanooga generalise?** Its 220 trails have no `osmIds`. A naive name
   match against OSM hits 45%, but that's a floor — Bend's matcher works
   geometrically. Running `scripts/align_bend_geometry.py` against Tennessee
   would answer it cheaply.

## Payload gotchas found along the way

True regardless of how geometry is stored:

- **The project must be ESM.** Payload 3's CLI can't load a config from a
  CommonJS project.
- **`/api/<collection>` is Payload's.** Our own `/api/trails` silently shadowed
  the collection's list endpoint.
- **Pin `graphql` to v16** — Payload peer-depends on `^16.8.1`, a fresh install
  pulls 17.
- **`@payloadcms/richtext-lexical` breaks the CLI** with a top-level-await error
  under its CJS loader. Dropped; there are no rich-text fields.
- **Payload's exported `geometryColumn` is Point-only.**

## Licensing notes

1. **`package.json` has no `license` field**, though `LICENSE` is GPLv3. Tools
   and forkers read the manifest.
2. **GPLv3 vs AGPLv3.** GPLv3 doesn't reach software people only *use* over a
   network. This is a web app, so if modified public copies should publish their
   changes, AGPLv3 is the license that does it.
3. **`mapbox-gl` v3 is not free software** (Mapbox left BSD at v2) and we depend
   on `^3.24.0` — compiled into a copyleft app. **MapLibre GL JS** (BSD-3) is the
   drop-in replacement, ~95% the same API. Needs its own decision.

## Sources

- Directus — [existing database](https://directus.com/features/existing-database) ·
  [map interface](https://directus.com/docs/guides/data-model/interfaces) ·
  [license change](https://directus.com/resources/directus-v12-license-change) ·
  [PostGIS requirement](https://github.com/directus/directus/issues/10046)
- Payload — [Postgres adapter](https://payloadcms.com/docs/database/postgres) ·
  [transactions](https://payloadcms.com/docs/database/transactions) ·
  [point field](https://payloadcms.com/docs/fields/point) · `geometryColumn` read
  from the published source (`@payloadcms/drizzle` 3.87.0,
  `dist/postgres/schema/geometryColumn.js`) — a third-party summary previously
  cited here described a signature the package does not have
- Strapi — [PostGIS](https://strapi.io/integrations/postgis) ·
  [geometry-fields plugin](https://github.com/MarkovMedia/strapi-v5-geometry-fields)
- Keystone — [repo](https://github.com/keystonejs/keystone) · [roadmap](https://keystonejs.com/roadmap)
- AdminJS — [site](https://adminjs.co/) · [adminjs-drizzle](https://github.com/makuko/adminjs-drizzle)
- Drizzle — [PostGIS geometry](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
