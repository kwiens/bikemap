# Deploying for your community

Open Bike Map is designed to be re-skinned for a new community by forking the
repo and editing a small, well-marked set of files — no rewrite. This is the
end-to-end checklist. A condensed version is at the [bottom](#checklist).

## Prerequisites

- **Node.js 20+** and **pnpm 10+**
- A free **[Mapbox](https://account.mapbox.com/)** account (map rendering,
  vector tilesets, terrain)
- **Python 3.10+** — only if you have mountain bike trails to process
- A host for the build — **Vercel** works with zero config

## 1. Fork and run locally

```bash
git clone https://github.com/<you>/bikemap.git
cd bikemap
pnpm install
cp .env.example .env.local
pnpm dev                       # http://localhost:3000
```

The map will be blank until you add a Mapbox token (next step) — the browser
console says so explicitly.

## 2. Mapbox setup

1. In [Mapbox Studio](https://studio.mapbox.com/), create (or duplicate) a map
   **style**. Note its style URL (`mapbox://styles/<user>/<id>`).
2. Create a **public access token** at
   <https://account.mapbox.com/access-tokens/> (starts with `pk.`). Scope it to
   your domains.
3. Put the token **and your style URL** in `.env.local`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
   NEXT_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/<you>/<your-style-id>
   ```
   Set both in your host's environment for production.

> **You must set your own style.** The default belongs to the upstream Mapbox
> account, and its `composite` source mixes Mapbox's tilesets with private
> `swuller.*` ones. With any other token that composite 404s and Mapbox drops
> the **whole basemap** with no visible error — you get trails and overlays
> floating on a blank background. If your map looks like that, this is why.

## 3. Branding — `src/config/site.config.ts`

One file controls app identity. Edit every field:

| Field | Used for |
|---|---|
| `name` / `shortName` | Page title, welcome modal, PWA manifest, iOS title |
| `description` / `tagline` | Meta description, PWA manifest, welcome modal |
| `url` | Canonical link |
| `themeColor` / `backgroundColor` | PWA theme + splash (match your brand) |
| `storageKeyPrefix` | Cookie / localStorage key prefix — **pick your own** so it's distinct per deployment |

Brand colors also live in `tailwind.config.ts` as `app-primary` / `app-secondary`.

## 4. Geography — `src/config/map.config.ts`

| Field | What to set |
|---|---|
| `mapbox.styleUrl` | Comes from `NEXT_PUBLIC_MAPBOX_STYLE_URL` (step 2) — no code change needed |
| `defaultView` | `center` `[lng, lat]`, `zoom`, `pitch`, `bearing` — where the map opens |
| `gbfs.baseUrl` | Your city's [GBFS](https://gbfs.org/) feed, or remove the bike-share layer if there's none |
| `region.name` / `region.displayName` | Your region's slug and display name |

## 5. Content data — `src/data/`

Replace the routes, trails, shops, and points of interest with your own. Each
file is a typed array — see **[DATA.md](DATA.md)** for the full field-by-field
contract of `BikeRoute`, `MountainBikeTrail`, `BikeResource`, `MapFeature`, and
`LocalResource`.

## 6. Routes and curated trails

- **Routes** — publish Route records in Payload; Casual mode reads them from
  `/api/map/routes?city=<city>` with no Studio fallback. Imported routes store
  normalized geometry plus provenance. To reuse an existing curated trail,
  choose “Existing trail” as the geometry source and select a same-city Trail;
  its current line, distance, and bounds then drive the route automatically.
- **Trails** — prepare a WGS84 GeoJSON file with one `MultiLineString` feature
  per curated trail, seed it into Payload, and configure the city layer with
  `/api/map/trails?city=<city>` plus the static file as
  `geojsonFallbackUrl`. Each `MountainBikeTrail.trailName` must match the
  feature's `Trail` property.

Chattanooga's source is an ESRI shapefile; its checked-in converter performs
the reprojection and grouping:

```bash
python scripts/prepare_chattanooga_trails.py /path/to/Chattanooga_Regional_Trails_4.shp
pnpm prepare:chattanooga-measurements
pnpm db:seed:chattanooga
```

The measurement step requires `NEXT_PUBLIC_MAPBOX_TOKEN`. It uses the same
measurement code as Payload and regenerates both the checked-in summaries and
static elevation profiles before the seed imports them with the geometry.

## 7. Trail elevation pipeline (optional)

Only if you have mountain bike trails. `pnpm backfill:elevation` measures a
database trail that has geometry but no stored profile. Chattanooga's prepared
seed already includes profiles; the legacy Python script remains available for
the historical Mapbox-vector-tile workflow.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/add_trail_elevation.py          # all trails
python scripts/validate_trails.py              # sanity-check
```

This populates the script-generated fields documented in [DATA.md](DATA.md).

## 8. Ride-recording elevation tiles — `public/terrain/` (optional)

The ride recorder corrects noisy GPS altitude against pre-cached Mapbox
Terrain-RGB tiles served locally from `public/terrain/{z}/{x}/{y}.png` (see
`src/utils/dem.ts`). **The committed tiles cover the Chattanooga area only**
(z13, ~21 MB).

This degrades gracefully: for points outside the cached tiles, recorded rides
keep their raw GPS altitude — nothing breaks, but ride elevation profiles are
less accurate. For your region, either:

- **Skip it** — delete `public/terrain/` and ship without DEM correction, or
- **Regenerate it** — cache z13 Terrain-RGB tiles covering your area under
  `public/terrain/13/{x}/{y}.png` (256px `mapbox.terrain-rgb` tiles). There is
  no script for this yet; it's a manual tile fetch.

## 9. Brand assets — `public/`

Replace with your own:

- **Logos** — `public/Bike-Chatt_Logo-*.svg` (referenced by the About page;
  rename and update the paths in `src/app/about/page.tsx`)
- **Icons** — `favicon.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- **iOS splash screens** — `public/splash/*`
- **README screenshots** — `screenshot-splash.png`, `screenshot-route.png`

## 10. Deploy

```bash
pnpm build      # verify the production build locally
```

On **Vercel**, one project can serve every city and one Neon database can hold
all of their content. Rows are scoped by the required `city` field; splitting a
city out later is a data move and environment-variable change, not a different
application schema.

```bash
# Link the repository to its Vercel project.
vercel link

# Provision one shared Neon resource in the same region as the app. Payload
# owns admin authentication, so Neon Auth is not needed.
vercel integration add neon \
  --name bikemap-global \
  --plan free_v3 \
  --metadata region=iad1 \
  --metadata auth=false

# Pull the pooled runtime URL and direct migration URL locally.
vercel env pull .env.local --yes
```

Set `PAYLOAD_SECRET`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
`NEXT_PUBLIC_MAPBOX_STYLE_URL`, `NEXT_PUBLIC_CITY_ID`, and
`NEXT_PUBLIC_CITY_HOST_MAP` for **Production, Preview, and Development**. The
Neon integration supplies `DATABASE_URL` (pooled application traffic) and
`DATABASE_URL_UNPOOLED` (schema migrations).

### Preview and production database policy

"Preview uses the same database as production" means that the running preview
application connects to the same Neon database with the same Payload secret.
It sees the same content and users, and an admin edit made from a preview is a
real edit that production will also see. Browser login cookies are scoped to a
hostname, so an administrator may still need to sign in separately on a preview
URL with the same credentials.

It does **not** mean that a preview build may change the shared database schema:

| Vercel environment | Data and admin accounts | Application writes | Schema migrations during build |
|---|---|---|---|
| Preview | Shared with production | Live; visible in production | Skipped |
| Development | Shared when configured with the shared URLs | Live; visible in production | Skipped |
| Production | Shared global database | Live | Applied through `DATABASE_URL_UNPOOLED` |

This separation prevents an unmerged commit from changing the database under
the currently deployed production code. It also prevents previews for different
branches from racing to apply incompatible migrations.

For a schema-changing pull request, the deployment sequence is:

1. The preview build skips migrations and runs against the current production
   schema.
2. The change is reviewed and merged. Until then, its application code must
   remain compatible with the current schema.
3. The production build applies the committed Payload migrations through
   `DATABASE_URL_UNPOOLED`.
4. Vercel starts serving the new production code against the migrated schema.

The tradeoff is deliberate: a preview can exercise shared accounts, content,
and normal writes, but it cannot fully exercise a new schema before the
production deployment. Use a separate Neon branch or database when a change
requires pre-merge migration testing; do not point that isolated preview at the
global database.

A database-free fork skips migrations and still builds the checked-in fallback
map.

Seed every city into the same fresh database after the initial migration. Both
commands are idempotent; Bend's command also seeds its eight Casual routes:

```bash
pnpm db:migrate
pnpm db:seed:chattanooga
pnpm db:seed:bend
```

Production builds also run `pnpm db:seed:bend-routes` after migrations. It
derives only those eight rows from the committed bike network and skips rows
whose geometry and metadata are already current; it also preserves rows a
curator has switched to a Trail source. Chattanooga route imports remain
manual because their verified GIS archive is not committed.

Any Node host also works: set the same variables, run `pnpm run ci`, then
`pnpm start`.

## Checklist

- [ ] `.env.local` has `NEXT_PUBLIC_MAPBOX_TOKEN`
- [ ] Vercel has one shared Neon resource with pooled and unpooled URLs
- [ ] `PAYLOAD_SECRET` is set in every deployed environment
- [ ] Payload migrations and both city seeds have completed
- [ ] `src/config/site.config.ts` — name, description, URL, colors, storage prefix
- [ ] `src/config/map.config.ts` — style URL, default view, GBFS, region
- [ ] `src/data/*` — routes, trails, shops, POIs ([DATA.md](DATA.md))
- [ ] Route layer IDs and trail tileset wired to Mapbox Studio
- [ ] Trail elevation script run (if you have MTB trails)
- [ ] `public/terrain/` DEM tiles regenerated or removed (ride-recording elevation)
- [ ] `public/` brand assets replaced
- [ ] `pnpm build` passes; host env var set
