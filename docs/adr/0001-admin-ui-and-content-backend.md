# ADR-0001 — CMS options for map content

- **Status:** Proposed — for maintainer discussion
- **Date:** 2026-08-04

We're moving map content (routes, trails, POIs, shops) out of TypeScript files
into Postgres + PostGIS, with an admin UI on top. This compares the options for
that admin UI.

## What we're judging them on

| | Criterion | Why it matters |
|---|---|---|
| C1 | **Real PostGIS geometry** | Geometry is the data. We need actual `geometry` columns we can run spatial queries against and build map tiles from — not GeoJSON stuffed in a text field. |
| C2 | **We control the schema** | We write the migrations, and the ORM must not get in PostGIS's way. Drizzle is a preference, not a requirement; Kysely works too. **Avoid Prisma** — it can't read or write geometry columns. |
| C3 | **How many services it adds** | We're staying fork-and-deploy, so anything we add, every forker also has to run. |
| C4 | **We can reuse our React components** | The map, elevation chart, and shadcn/Radix components already exist. "It's React" isn't enough — an admin that builds separately can't import them. |
| C5 | **Roles, drafts, revisions** | Replaces what we get free from GitHub PRs today. |
| C6 | **Free software** | Our code is GPLv3 and stays copyleft. Dependencies must be free software — MIT and BSD are fine. Source-available licenses and paid feature tiers are not. |

---

## Directus

Separate Node service with a Vue admin. Reads the schema we build rather than
creating its own.

**Pros**
- **Best PostGIS support of anything here (C1).** Real geometry field types, and a
  built-in map interface that draws and edits points, lines, and polygons. Nothing
  else can edit a line out of the box.
- **Leaves our schema alone (C2).** We own the tables and migrations.
- REST and GraphQL APIs over the content, immediately.
- Permissions down to the row, plus revisions, audit log, and file storage (C5).

**Cons**
- **Not free software — this rules it out (C6).** Directus 12.2.0 publishes as
  `SEE LICENSE IN license`: BSL 1.1, and since v12 (May 2026) the Monospace
  Sustainable Core License. It's free under $5M revenue and becomes GPLv3 after
  three years, but today it's source-available, not open source. A GPLv3 app that
  needs it isn't a free stack, and a large enough forker has to buy a license.
  Running it as a separate service probably keeps us legal, but it misses the
  point.
- **A second service to run (C3).** Its own container, and every content read
  becomes an HTTP call to another service that we have to cache.
- **Custom UI is Vue (C4).** A trail editor would be a second copy of our map UI
  in a second framework.
- Won't install the PostGIS extension itself.
- Logic lives in Flows (visual automation), which is harder to test than code.

---

## Payload

TypeScript CMS that runs inside our existing Next app. Its Postgres adapter is
built on Drizzle and hands us the client at `payload.db.drizzle`.

**Pros**
- **No extra service (C3).** Same app, same deploy, same login.
- **Custom fields are React (C4)** — really reuses our map code, elevation chart,
  and existing components.
- Server components can call it directly as a typed function, with no HTTP request.
- MIT (C6). Works with Next 16 as of 3.73; we're on 16.2.7.
- Access control, jobs, drafts, and versions (C5).
- Ships PostGIS support: `extensions: ['postgis']` and an exported
  `geometryColumn(name, type, srid)` covering POINT through MULTIPOLYGON.

**Cons**
- **PostGIS support stops at the column (C1).** Payload can create a geometry
  column, but its field types only go as far as `point`. A MultiLineString isn't
  something Payload understands, so it won't appear in the API, can't be queried
  through Payload, and can't be edited in its admin. Workable, but only with the
  design below.
- **Payload writes the schema for our content (C2)**, rather than us writing it.
  Less of a problem now that C2 is about controlling the schema rather than using
  Drizzle specifically.
- No line editing in the admin — we'd build it.
- v4 is in canary (3.87.0 is stable), so a major upgrade is coming.

### Getting PostGIS to work anyway

Two approaches; the second is much safer.

**Path A — teach Payload about the geometry.** Declare the field as `type: 'json'`
so Payload stores and versions it, then use `afterSchemaInit` to swap the column
for a real `geometry(MultiLineString, 4326)`. A Drizzle `customType` handles
conversion in both directions. Payload sees JSON; Postgres sees geometry.

*Risk:* built from documented pieces, but nobody's proven this combination, and it
leans on how Payload generates its schema right before a major version. Migrations
are the tricky part — Payload writes its own DDL, so a swapped column type
probably needs hand-holding.

**Path B — keep geometry out of Payload entirely.** Payload owns the text fields;
geometry lives in its own table keyed by trail id, which our code owns and a
custom map view edits.

This is a supported approach, not a hack — `beforeSchemaInit` exists to "extend
your database structure with tables that won't be managed by Payload," and
`geometryColumn` is exported for the column. **Details in
[Appendix A](#appendix-a--path-b-in-detail).**

*Risk:* low — nothing fights Payload, nothing to recheck on upgrade. *Cost:* two
places to edit a trail, geometry changes don't show up in Payload's version
history, and the geometry work is slightly *bigger* here than in a custom admin.

**Neither path lets us run spatial queries through Payload**, so those and map
tiles go through `payload.db.drizzle` directly. That's fine — tile queries skip
the CMS under every option.

---

## Strapi

MIT Node CMS. Separate service, React admin.

**Pros**
- MIT and free to self-host (C6, for the core).
- React admin (C4).
- Big ecosystem, familiar to many people.

**Cons**
- **Its content-type builder owns the schema and writes its own migrations (C2).**
- **PostGIS only through third-party plugins (C1).**
  `@gismark/strapi-geometry-fields` is the closest; `strapi-plugin-location` only
  does points. Both are small projects on a CMS that has broken plugin APIs
  between major versions.
- **Custom roles are a paid feature (C5, C6)** — per-city curators may not be
  possible on the free version, which puts a paywall inside a free stack.
- A second service (C3).

---

## Keystone 6

TypeScript, GraphQL, React admin, MIT. Maintained by Thinkmill; still active but
releases more slowly than the others.

**Pros**
- MIT (C6), schema defined in TypeScript, React admin (C4).
- Can run inside a Next app (C3).

**Cons**
- **Built on Prisma, which handles geometry worst of anything here (C1).** Prisma
  models geometry as a column type it can't read or write — worse than Payload,
  not better. *(Worth verifying before taking seriously.)* The ORM's name matters
  less now that C2 is about controlling the schema; this is the real objection.
- Smaller ecosystem, slower releases.

---

## AdminJS

Generates admin screens over a schema we own — in theory the middle ground
between buying and building.

**Pros**
- **Doesn't constrain the schema (C1, C2).** We write the PostGIS tables; it
  renders forms over them.
- MIT (C6).
- Free list/form/filter screens — though that's worth more the more tables you
  have, and we have about six.

**Cons — it doesn't fit our stack**
- **React version clash.** AdminJS 7.8.17 needs `react@^18.2.0`; we're on React
  19.2.7. Its admin builds separately as its own React 18 app.
- **We couldn't reuse our components (C4).** Map, elevation chart, and shadcn
  components would be rewritten against AdminJS's own component API and design
  system — Directus's problem without Directus's PostGIS support.
- **No official Next.js integration (C3).** It targets Express, Nest, Fastify,
  Koa, and Hapi.
- **No official Drizzle support.** The official adapters are Prisma, TypeORM,
  Sequelize, Mongoose, and MikroORM. The community `adminjs-drizzle` is **v0.1.2,
  three releases total, last published 2025-08-12** — pre-1.0 and about a year
  stale, sitting on the piece we'd depend on most.
- Geometry needs custom components anyway, written their way.
- No content API, no drafts, revisions, or roles (C5).

*Refine and React-Admin avoid the React 18 problem, but they're UI frameworks
rather than schema-driven generators — they still need us to write the layer that
feeds them data, which puts them closer to building our own.*

---

## Build our own

An `/admin` section in the existing app: our own schema (Drizzle or Kysely) on
PostGIS, Auth.js for login, our existing components, a Mapbox/MapLibre draw
component, and **oRPC** (v1.14.14, MIT, actively released) or tRPC for typed calls
between client and server. Server components read the database directly; RPC
covers what the browser needs.

"Build our own" means assembling libraries, not starting from scratch: Auth.js,
react-hook-form and zod for forms, TanStack Table for lists. What we write is the
part that's specific to us.

**Pros**
- **Nothing between us and PostGIS (C1, C2).** Best fit for a schema that also
  feeds map tiles.
- **No extra service (C3)**, all our components work (C4), no license questions
  (C6), and no dependency to keep upgrading.
- The trail editor is the same work here as anywhere, without a framework to fit
  it into.
- Smaller than it sounds: ~250 rows per city and a handful of editors who are all
  maintainers means "roles" is a city column and a login check, not a permissions
  system.

**Cons**
- **We build and maintain login, roles, forms, validation, revisions, and audit
  (C5)** — and keep maintaining them.
- Easy to skimp on the boring parts (audit trail, soft delete, two people editing
  at once) and regret it later.

---

## Comparison

| | Directus | Payload | Strapi | Keystone | AdminJS | Build our own |
|---|---|---|---|---|---|---|
| **C1 Real PostGIS geometry** | ✅ best | ⚠️ via Path B | ⚠️ plugin | ❌ Prisma | ✅ data, ❌ UI | ✅ |
| **C2 We control the schema** | ✅ | ⚠️ Payload writes it | ❌ | ⚠️ Prisma | ✅ | ✅ |
| **C3 Extra services** | +1 | none | +1 | none | no Next support | none |
| **C4 Reuse our components** | ❌ Vue | ✅ | ✅ | ✅ | ❌ React 18 | ✅ |
| **C5 Roles/drafts/revisions** | ✅ | ✅ | 💰 paid roles | ✅ | ❌ we build | ❌ we build |
| **C6 Free software** | ❌ | ✅ MIT | ⚠️ paid roles | ✅ MIT | ✅ MIT | ✅ |
| Can edit lines out of the box | ✅ | ❌ | ⚠️ plugin | ❌ | ❌ | ❌ |
| Content API included | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Recommendation

**Ruled out:**

| Option | Why |
|---|---|
| Directus | **C6** — source-available, not free software |
| Strapi | **C2** — its builder owns the schema; **C6** — paid roles |
| Keystone | **C1** — Prisma can't handle geometry |
| AdminJS | **C4** — React 18, no Next support, year-old 0.1.x adapter |

**That leaves Payload or building our own.** Both are MIT or ours, add no
services, and let us reuse our React components.

The question that decides it: **is this admin mostly forms over a database, or is
it a map tool?**

- Mostly forms → **Payload.** Its admin is a good one, and login, roles, drafts,
  versions, and audit come maintained by someone else.
- A map tool → **build our own.** Trails *are* geometry. Elevation profiles, OSM
  imports, difficulty presets, and map previews are the substance; the text fields
  are secondary. Under Payload most of that becomes custom React living inside
  Payload's layout — we write the hard parts either way, just inside someone
  else's frame.

**We think it's a map tool, so: build our own.** Also worth weighing:

- Generated CRUD screens are worth more the more tables you have, and we have
  about six. No media library, no translations, no plugins, no approval workflow.
- The hard parts are custom under every option.
- **The first version needs no drawing tool at all.** If Mapbox Studio stays the
  place geometry gets drawn, v1 is text fields plus an import button. The editor
  comes later, once we know what it needs to do.
- "Build login" overstates it — Auth.js is configuration, not cryptography.

**The cost, plainly:** we own the content API, roles, drafts, revisions, and audit
forever. Build the audit table and city scoping on day one; skipping them is the
predictable way this goes wrong.

**What would change the answer:** if we want real editorial review — approvals,
rollback, full version history — Payload earns its keep. Same if editing ever
opens up beyond maintainers to public submissions, where moderation queues and
real permissions start paying for themselves. Decide that now rather than later.

**This is less risky than it looks.** The schema is ours either way, so the
database is what lasts and the admin is a UI we can replace. If ours disappoints,
something else can go on top of the same tables.

**Settle it with a spike, not more discussion** (2–3 days each): one trail edit
screen built end to end our way, or Path B under Payload.

---

## Licensing notes

Three things turned up while checking C6:

1. **`package.json` has no `license` field**, even though `LICENSE` is GPLv3.
   Worth fixing — tools and forkers read the manifest.
2. **GPLv3 vs AGPLv3.** GPLv3 doesn't apply to software people only *use* over a
   network. If we want anyone running a modified copy as a public site to publish
   their changes, **AGPLv3 is the license that does that** — and this is a web app,
   so it's the whole question.
3. **`mapbox-gl` v3 is not free software** (Mapbox stopped using BSD at v2) and we
   depend on `^3.24.0`. That conflicts with shipping a copyleft app, and unlike a
   separate service it's compiled into ours. **MapLibre GL JS** (BSD-3) is the
   drop-in replacement — same origins, roughly 95% the same API. Needs its own
   decision.

---

## Appendix A — Path B in detail

How geometry would sit alongside Payload, so the team can judge it rather than
take "workable" on trust.

**1. Turn on the extension.** Payload installs it for us:

```ts
postgresAdapter({
  pool: { connectionString: process.env.DATABASE_URL },
  extensions: ['postgis'],
})
```

**2. Define the geometry table** as normal Drizzle, using Payload's own helper:

```ts
// db/geometry.ts
import { pgTable, integer, index } from 'drizzle-orm/pg-core'
import { geometryColumn } from '@payloadcms/db-postgres'

export const trailGeometry = pgTable('trail_geometry', {
  trailId: integer('trail_id').primaryKey(),   // points at Payload's trails.id
  geom: geometryColumn('geom', 'MULTILINESTRING', 4326),
}, (t) => ({
  geomIdx: index('trail_geometry_geom_idx').using('gist', t.geom),
}))
```

**3. Tell Payload it exists**, so it doesn't delete it in development:

```ts
beforeSchemaInit: [
  ({ schema }) => ({
    ...schema,
    tables: { ...schema.tables, trailGeometry },
  }),
]
```

**4. Read and write it** through `payload.db.drizzle`, converting in SQL:

```ts
// read
const [row] = await payload.db.drizzle
  .select({ geojson: sql<string>`ST_AsGeoJSON(${trailGeometry.geom})` })
  .from(trailGeometry)
  .where(eq(trailGeometry.trailId, id))

// write
const g = sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})`
await payload.db.drizzle.insert(trailGeometry)
  .values({ trailId: id, geom: g })
  .onConflictDoUpdate({ target: trailGeometry.trailId, set: { geom: g } })
```

**5. Edit it in the admin** with a `type: 'ui'` field on the trails collection.
`ui` fields render a component and store nothing, which is what we want. It talks
to a custom endpoint running the queries above, and that component is where our
existing map code gets reused.

### A variant

`afterSchemaInit` lets us add columns to Payload's *own* tables, so `geom` could
sit directly on the trail row — no second table, no join. But schema changes made
this way don't show up in the generated schema file, which makes migrations
messier. **Prefer the separate table**: it's entirely ours, migrations included.

### Things that will bite, worst first

1. **Transactions.** Payload wraps its writes in a transaction. A write through
   `payload.db.drizzle` happens outside it, so the text fields and the geometry
   don't save together — a trail can save while its geometry fails. Payload can
   start and commit transactions for us, but joining one Payload already has open
   means using internals. **Confirm this works in the spike.**
2. **Development resets.** Payload syncs the schema in development, and step 3 is
   what stops it deleting our table. Setting `push: false` is safer still.
3. **Access control.** Payload's permissions protect Payload's own endpoints, not
   ours. Our endpoint has to check the user and their city itself, or anyone can
   rewrite geometry.
4. **ID types must match.** `trail_id` has to match Payload's id type — a number by
   default, or a UUID if configured that way.
5. **Don't reuse a table name** that collides with a collection.

### What this means for the decision

Path B is a supported approach, which strengthens Payload. But look at what gets
built either way: the map editor, the read/write endpoint, the permission checks,
and the transaction handling. A custom admin needs all the same geometry work
**without** the extra wiring — no registration step, no risk of the table being
dropped, no transaction bridging, no id-type coupling.

So Payload's real advantage stays login, roles, drafts, versions, and audit. The
geometry work costs slightly more there, not less.

---

## Sources

- Directus — [existing database](https://directus.com/features/existing-database) ·
  [map interface](https://directus.com/docs/guides/data-model/interfaces) ·
  [license change](https://directus.com/resources/directus-v12-license-change) ·
  [PostGIS requirement](https://github.com/directus/directus/issues/10046)
- Payload — [Postgres adapter](https://payloadcms.com/docs/database/postgres)
  (schema hooks, `extensions`, `push`) ·
  [transactions](https://payloadcms.com/docs/database/transactions) ·
  [`geometryColumn`](https://tessl.io/registry/tessl/npm-payloadcms--db-postgres/3.54.0/files/docs/index.md) ·
  [point field](https://payloadcms.com/docs/fields/point)
- Strapi — [PostGIS](https://strapi.io/integrations/postgis) ·
  [geometry-fields plugin](https://github.com/MarkovMedia/strapi-v5-geometry-fields) ·
  [location plugin](https://github.com/notum-cz/strapi-plugin-location)
- Keystone — [repo](https://github.com/keystonejs/keystone) · [roadmap](https://keystonejs.com/roadmap)
- AdminJS — [site](https://adminjs.co/) · [adminjs-drizzle](https://github.com/makuko/adminjs-drizzle) ·
  [Refine](https://github.com/refinedev/refine)
- Drizzle — [PostGIS geometry](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
