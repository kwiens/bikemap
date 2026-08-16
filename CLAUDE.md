# Repository Guidelines

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server at localhost:3000
pnpm build        # Build for production
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm lint         # Run ESLint + Biome lint + Biome format checks
pnpm lint:fix     # Auto-fix linting/formatting issues
```

Content backend (Payload + OSM — see below):

```bash
pnpm db:up              # Start local Postgres via docker compose
pnpm db:migrate         # Apply migrations
pnpm db:seed:bend       # Import Bend's trails (Chattanooga has its own script)
pnpm generate:types     # Regenerate src/payload-types.ts after a collection change
pnpm generate:importmap # Regenerate the admin import map after adding a component
```

## Git & GitHub

Use `gh` CLI for GitHub operations:

```bash
gh pr create --title "Title" --body "Description"  # Create PR
gh pr view [number]                                 # View PR details
gh pr edit [number] --body "New description"        # Edit PR
gh pr merge [number]                                # Merge PR
gh pr list                                          # List open PRs
gh issue list                                       # List issues
gh issue view [number]                              # View issue details
```

## Architecture

This is a Next.js 15 App Router application displaying an interactive Mapbox map of Chattanooga bike routes and resources.

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── Map.tsx            # Main map orchestrator
│   ├── MapLegend.tsx      # Sidebar container with state management
│   ├── MapMarkers.tsx     # Marker factory and MarkerManager class
│   └── sidebar/           # Extracted sidebar components
│       ├── BikeRoutes.tsx, MapLayers.tsx, etc.
│       ├── types.ts       # Shared interfaces
│       └── index.ts       # Barrel export
├── config/
│   └── map.config.ts      # Centralized geo config (for multi-geography support)
├── data/
│   ├── geo_data.ts        # Static routes, attractions, bike shops
│   └── gbfs.ts            # Live bike share API integration
├── hooks/
│   ├── useToast.ts        # Toast notification with auto-dismiss
│   ├── useMapResize.ts    # Window/sidebar resize handling
│   └── useLocationTracking.ts
└── utils/
    └── map.ts             # Geocoding, route opacity, bounds utilities
```

### Core Data Flow

1. **Page Entry** (`src/app/page.tsx`): Dynamically imports Map component with SSR disabled (Mapbox requires browser)
2. **Map Component** (`src/components/Map.tsx`): Main orchestrator that initializes Mapbox, manages markers, and handles custom events
3. **Data Sources** (`src/data/`):
   - `geo_data.ts`: Static data for bike routes, attractions, bike shops (BikeRoute, MapFeature, BikeResource interfaces)
   - `gbfs.ts`: Live bike share station data from Chattanooga GBFS API

### Configuration

`src/config/map.config.ts` centralizes all geography-specific settings:
- Mapbox access token and style URL
- Default map view (center, zoom, pitch, bearing)
- GBFS API endpoints
- Region metadata

This enables future multi-geography support by swapping config files.

### Event-Driven Communication

The app uses custom DOM events (`window.dispatchEvent`) for component communication:

| Event | Dispatched By | Handled By | Purpose |
|-------|--------------|------------|---------|
| `route-select` | Sidebar, Map | Map, Sidebar | Bidirectional sync: highlights route on map AND in sidebar |
| `layer-toggle` | Sidebar | Map | Shows/hides marker layers (attractions, bikeResources, bikeRentals) |
| `center-location` | Sidebar | Map | Pans map to a specific location |
| `route-deselect` | Sidebar | Map | Resets all route opacities |
| `sidebar-toggle` | Sidebar | Map | Triggers map resize after sidebar animation |

**Important**: `route-select` is bidirectional - both Map and MapLegend listen for it. When clicking a route on the map, the map dispatches the event and MapLegend updates its selection state. When clicking in the sidebar, MapLegend dispatches the event and Map handles the visual update.

### Marker System

`MapMarkers.tsx` provides factory functions for different marker types and a `MarkerManager` class for bulk operations. Markers are pre-created at init but only added to map when their layer is toggled on.

### Map Styling

Routes are styled via Mapbox Studio (referenced by layer IDs like `riverwalk-loop-v3-public`). Route bounds are calculated from layer features at runtime to enable zoom-to-fit.

### Mountain Bike Trails

The MTB trails layer contains 220+ trails identified by the `Trail` feature property. The editable trail array (`mountainBikeTrails`) lives in `src/data/mountain-bike-trails.data.ts` with precalculated `defaultBounds` for zoom-to-fit and `distance` in miles; the wrapper `src/data/mountain-bike-trails.ts` holds the types, the `MTN_BIKE_*` layer-id constants, and `REGION_MAP`/`regionFor`, and re-exports the array. Both are re-exported from `src/data/geo_data.ts`. Code uses `MTN_BIKE_*` constants and the `mountainBikeTrails` array everywhere — names like "SORBA" only appear when referring to the upstream GIS dataset.

#### The Mapbox style ≠ the MTB trails tileset

The Mapbox Studio style does **not** include the MTB trails tileset. We attach it ourselves at runtime via `ensureMtnBikeSource(map)` (in `utils/map.ts`), called during `style.load` before `initMtnBikeColors` / `initMtnBikeLayers`. The source is added as `MTN_BIKE_SOURCE_ID` pointing at `MTN_BIKE_TILESET_URL` (currently `mapbox://swuller.ccfw1cmr`), with the main `MTN_BIKE_LAYER_ID` layer attached on top. Everything downstream (color expression, casing/glow/hit, filter, opacity, selection, hit-testing) assumes the layer is named `MTN_BIKE_LAYER_ID` regardless of how it was attached.

The Godsey Ridge trails layer (`Godsey Ridge Trails`, source-layer `LineStrings`) *is* baked into the Mapbox Studio style, so it doesn't need a runtime `addSource` — only the casing/glow/hit sublayers are added.

#### When a tileset gets renamed

GIS layers in Mapbox Studio get re-uploaded and renamed periodically. When that happens you'll see one of:

- The `MTN_BIKE_LAYER_ID` layer is missing from `getStyle().layers` → **this is normal**, the layer is attached at runtime. Don't conclude it was removed/renamed without first checking whether `ensureMtnBikeSource` ran successfully (look for `map.getSource(MTN_BIKE_SOURCE_ID)` and `map.getLayer(MTN_BIKE_LAYER_ID)` after style load).
- The `Trail` property values in the rendered features look unfamiliar (e.g. greenways or OHV trails instead of MTB trails) → **the underlying tileset was swapped**. Don't auto-update `MTN_BIKE_TILESET_URL` / `MTN_BIKE_SOURCE_LAYER` to whatever new tileset shows up in the style — the new tileset is often a different curated dataset (e.g. TPL paved greenways), not a rename. Verify the tileset's `vector_layers` and feature properties (`rating`, `Rec_Area`, `Trail`) match what the app expects before pointing the constants at it.
- The constants `MTN_BIKE_SOURCE_LAYER` (in `mountain-bike-trails.ts`) and `MVT_TILESET` (in `scripts/add_trail_elevation.py`) need to stay in sync with the **same** MTB tileset — both reference it independently.

To confirm a tileset is the right MTB one:
```bash
curl -s "https://api.mapbox.com/v4/<TILESET_ID>.json?access_token=<TOKEN>" \
  | jq '.vector_layers[0].fields | keys'
```
Expect to see `Trail`, `Rec_Area`, `rating`, `Use_` among the fields.

When trails are added or modified in the Mapbox tileset, run `scripts/add_trail_bounds.py` to recalculate bounding boxes and distances. The script takes raw coordinate data extracted from the Mapbox layer via Chrome DevTools console (see the script header for the extraction snippet) and computes both `defaultBounds` and `distance` fields.

#### Debugging Trails in Chrome DevTools

The map instance is exposed as `window.__map`. Use it to inspect layers and query trail features.

**Find the current source layer name** (needed when GIS data is re-uploaded):
```js
// MTB trails are attached at runtime — confirm the source + layer are in place
__map.getSource('mtb-trails-source')
__map.getLayer('mtb-trails')

// What source-layer is the runtime-attached MTB layer reading?
__map.getStyle().layers.find(l => l.id === 'mtb-trails')?.['source-layer']

// List all source-layers in the (Mapbox-Studio-managed) composite source — useful
// when checking what other layers are in the style, but the MTB layer won't appear here
[...new Set(__map.getStyle().layers.filter(l => l.source === 'composite').map(l => l['source-layer']))].sort()
```

**Find which tileset contains a source layer** (needed to update `MVT_TILESET` in the elevation script):
```js
// Fetch the current style to get tileset IDs
fetch('https://api.mapbox.com/styles/v1/swuller/cm91zy289001p01qu4cdsdcgt?access_token=<TOKEN>')
  .then(r => r.json()).then(d => console.log(d.sources.composite.url))

// Then query each swuller.* tileset to find the one matching the source layer
const token = '<TOKEN from map.config.ts>';
['id1','id2','...'].forEach(id =>
  fetch(`https://api.mapbox.com/v4/swuller.${id}.json?access_token=${token}`)
    .then(r=>r.json()).then(d=>console.log(id, d.vector_layers?.map(l=>l.id))))
```

**List all trail names** (pan to the area first — `querySourceFeatures` only returns loaded tiles). The MTB layer has its own source (`mtb-trails-source`), not `composite`:
```js
[...new Set(__map.querySourceFeatures('mtb-trails-source',
  {sourceLayer: '<CURRENT_SOURCE_LAYER>'}).map(f => f.properties.Trail))].sort()
```

**Inspect a specific trail's properties**:
```js
__map.querySourceFeatures('mtb-trails-source', {sourceLayer: '<CURRENT_SOURCE_LAYER>'})
  .filter(f => f.properties.Trail === 'Trail Name').map(f => f.properties)
```

#### Generating Elevation Profiles

The script `scripts/add_trail_elevation.py` fetches trail geometry from Mapbox Vector Tiles and samples elevation from Terrain-RGB tiles.

```bash
# Generate elevation for a single trail
python scripts/add_trail_elevation.py --trail "Trail Name"

# Generate elevation for all trails
python scripts/add_trail_elevation.py
```

**Important**: Short trails (under ~0.5 mi) may not appear at the default z12 zoom level. The script retries at z14 for missing trails, but very short trails may require z15. When running the script for a single trail and it reports "not found", fetch the geometry manually at z15 with an expanded bounding box covering the trail's area (see the script source for `extract_all_trails(zoom, bbox)`).

The script outputs:
- `public/data/elevation/{slug}.json` — per-trail elevation profile (distance, gain, loss, min, max, coordinate samples)
- Updates `src/data/mountain-bike-trails.data.ts` — summary stats (distance, elevationGain, elevationLoss, elevationMin, elevationMax)

#### Adding a New Trail

1. Find the trail name in Chrome DevTools (see above)
2. Add an entry to the `mountainBikeTrails` array in `src/data/mountain-bike-trails.data.ts` with `trailName`, `displayName`, `recArea`, `rating`, `color`, and `icon`
3. Run `scripts/add_trail_elevation.py --trail "Trail Name"` to generate elevation data and populate `distance`, elevation stats, and `defaultBounds`
4. If the trail is in a new `recArea`, add it to `REGION_MAP` in `mountain-bike-trails.ts`

### Nationwide OSM Bike Trails

A toggleable nationwide bike-trails layer sourced from the OpenStreetMap US
[tile service](https://openstreetmap.us/our-work/tileservice/). It is separate
from the curated Chattanooga MTB/route layers and off by default.

- Constants live in `src/data/osm-trails.ts`; the tileset is attached at runtime
  via `ensureOsmTrailsSource(map)` in `utils/map.ts` (same pattern as the MTB
  tileset — it is **not** in the Mapbox Studio style). We pass the TileJSON URL
  (`https://tiles.openstreetmap.us/vector/trails.json`) so Mapbox picks up zoom
  bounds (z0–14) and the "© OpenStreetMap contributors" attribution for free.
- The `trail` source-layer carries OSM tags. `OSM_BIKE_TRAIL_FILTER` selects
  bike-relevant ways: `bicycle` in {yes, designated, permissive}, OR a present
  `mtb:scale` tag (MTB singletrack often lacks an explicit bicycle tag), OR
  `highway=cycleway`. Lines are colored by `mtb:scale` difficulty, with a white
  casing for legibility, and inserted beneath the curated MTB layer.
- It toggles independently of the marker layers (it's a vector line layer, not a
  marker group): the "Nationwide trails" switch in the MTB **Trails** tab
  (`MapLegend`) dispatches `layer-toggle` with `layer: 'osmTrails'`; `Map.tsx`
  flips visibility via `setOsmTrailsVisible`.
- Trail POIs come from the `trail_poi` source-layer as a single symbol layer
  (`OSM_POI_LAYER_ID`, `minzoom 12`). `OSM_POI_FILTER` keeps trailhead parking
  (`amenity=parking`) and information points (`tourism=information`); the icon is
  picked per-category from the Mapbox style's built-in **Maki** sprite (`parking`
  / `information`) — no custom sprite/spreet step. It shares the trails toggle
  via `setOsmTrailsVisible`.
- Selectable: a transparent extra-wide hit layer (`OSM_TRAILS_HIT_LAYER_ID`) is
  the tap target. `registerOsmTrailSelection` (`utils/map.ts`) handles a click by
  (1) reassembling the way's geometry across tiles by `OSM_ID`
  (`collectOsmWayLines`), (2) highlighting the whole trail (`highlightOsmTrail` —
  a blue line over a white casing, like a selected route), and (3) dispatching
  `OSM_TRAIL_SELECT` with a ready-built `ElevationProfile` so the shared
  `ElevationProfile` pane shows the trail's name + distance + elevation chart
  (there is **no** popup — the pane is the only info surface). A `selectionId`
  guards against a stale async terrain sample showing the wrong trail; selecting
  a curated route/trail or any deselect clears the highlight, and the pane clears
  via its own listeners. `ElevationProfile` seeds `profileCache` for the OSM name
  so its `trailName` effect doesn't try to fetch a non-existent curated JSON.

#### Precomputed length + elevation

OSM trail tiles carry no length or elevation. The elevation **pane** always
needs a per-point profile (which precompute doesn't store), so its chart is
built from real-time terrain sampling (`buildOsmElevationProfile`). But a batch
tool precomputes the aggregate stats (length + gain/loss/min/max) offline per
region (sharded for an eventual nationwide run); when a region file covers the
clicked way, those stats drive the pane's **headline numbers** (via
`pointsToElevationProfile`'s `stats` override) — so both paths are supported.

- **Tool**: `scripts/osm_trail_elevation.py`. Geometry comes from the **Overpass
  API** (not the vector tiles — Overpass gives full-resolution ways + real OSM
  ids that match the tileset's `OSM_ID`, and one query beats tens of thousands of
  z14 tile requests for a whole state). The Overpass query mirrors
  `OSM_BIKE_TRAIL_FILTER`. Elevation comes from Mapbox Terrain-RGB at z14, run
  through a Python port of `computeElevation` (`src/utils/ride-stats.ts`) so the
  precomputed numbers match the client's on-demand fallback. Overpass needs a
  `User-Agent` header (else HTTP 406). Responses and terrain tiles are disk-cached
  (`scripts/.osm_cache/`, `scripts/.tile_cache/terrain14/`, both gitignored) so
  reruns are cheap and a national run is resumable. The two stages are throttled
  separately: per-way terrain sampling runs across `--workers` threads (default
  3 — Mapbox tolerates concurrency; the tile cache is thread-safe with per-tile
  locks), but Overpass fetches default to `--overpass-workers 1` + `--polite-sleep
  3` because concurrent/bursty Overpass requests get the client IP rate-limited or
  temporarily blocked. Raise `--overpass-workers` only against a private/self-hosted
  Overpass instance, never the public endpoint.

  ```bash
  python scripts/osm_trail_elevation.py --region oregon          # one state
  python scripts/osm_trail_elevation.py --bbox=-124.6,41.9,-116.4,46.3 --region-name oregon
  python scripts/osm_trail_elevation.py --region all             # every US state (long!)
  # If the local IP is blocked, route just the Overpass queries through another
  # host via SSH (key auth); elevation still samples Mapbox locally. The query
  # travels over stdin, so its brackets/quotes never hit a shell:
  python scripts/osm_trail_elevation.py --region tennessee --overpass-ssh user@host.example.com
  # Or point at a different Overpass endpoint entirely:
  python scripts/osm_trail_elevation.py --region tennessee --overpass-url https://HOST/api/interpreter
  ```

  A built-in `US_STATE_BBOX` table covers all 50 states + DC (padded boxes —
  slight overspill into neighbors is fine). The bbox is split into `--cell-deg`
  (default 0.5°) Overpass cells; ways are deduped by OSM id.

- **Output** (`public/data/osm-elevation/`):
  - `<region>.json` — `{ region, name, bbox, generatedAt, count, trails }` where
    `trails` maps `"<osmId>"` → `[lengthMeters, gain, loss, min, max]` (meters,
    compact arrays). One file per region.
  - `index.json` — manifest of `{ region, name, bbox, file }`, upserted on every
    run so files accumulate across regions.

- **Client**: `lookupPrecomputedElevation(osmId, lng, lat)` in
  `src/utils/osm-elevation.ts` loads the manifest once, then lazily loads + caches
  the region file(s) whose bbox covers the clicked point and looks up the way id.
  `registerOsmTrailSelection` (`utils/map.ts`) passes any hit to
  `buildOsmElevationProfile(lines, name, token, precomputed)` so the precomputed
  totals become the pane's headline stats; on a miss the totals are computed from
  the real-time samples instead.

### Mapbox UI Overlays

- The Mapbox canvas (`.map-container`) uses `position: absolute` with `z-index: 500` and covers the full viewport. It will obscure any sibling or child elements with a lower z-index.
- To overlay UI on the map, render elements **inside the `MapboxMap` component's fragment** (the `<>` in its return), as siblings of `.map-container`. Do **not** place overlays in the outer `BikeMap` wrapper — they will be hidden behind the map canvas.
- Overlay elements must use `z-index: 1000` or higher and `position: absolute` to appear above the map. See the route toast in `Map.tsx` and elevation overlay in `ElevationProfile.tsx` for working examples.
- The sidebar (MapLegend) manages its own stacking context separately and is not affected by this.

## Code Style

- Do not include "Co-Authored-By: Claude" in commit messages
- Use `function` keyword for pure functions and components
- Prefer interfaces over type aliases; avoid enums (use maps)
- Use functional components; minimize `use client`
- File order: exported component → subcomponents → helpers → static content → types
- Use existing icon libraries (Font Awesome or lucide-react) - don't add new ones
- Directories use lowercase-dash naming

### Styling with Tailwind CSS

All component styling uses Tailwind utility classes. The only remaining custom CSS is in `map.css` for Mapbox DOM-API elements (markers, popups, location dots) that cannot be styled with Tailwind.

- **Use `cn()` from `@/lib/utils`** (clsx + tailwind-merge) for conditional classes: `className={cn('base-classes', condition && 'conditional-classes')}`
- **Custom animations** go in `tailwind.config.ts` under `theme.extend.keyframes` and `theme.extend.animation`, not in CSS `@keyframes`.
- **Use standard Tailwind colors** (e.g., `text-gray-500`, `bg-red-500`). App brand colors are available as `app-primary` and `app-secondary`.
- **Dynamic values** that can't be expressed as Tailwind classes (e.g., computed widths from JS) can use `style={{}}` for that single property. Everything else should be Tailwind.
- **SidebarCard** (`src/components/sidebar/SidebarCard.tsx`) is a shared card component with a `colorTheme` prop (`blue | green | purple | gray`) used across AttractionsList, BikeResourcesList, BikeRentalList, and InformationSection.

## Testing

### Unit Tests

Tests are in `*.test.ts` or `*.test.tsx` files adjacent to their source files. Run with `pnpm test:run`.

Key test files:
- `src/utils/map.test.ts` - Utility function tests
- `src/config/map.config.test.ts` - Configuration tests
- `src/hooks/useToast.test.ts` - Hook tests
- `src/components/sidebar/BikeRoutes.test.tsx` - Component tests
- `src/data/gbfs.test.ts` - API integration tests

### Mapbox Testing Limitations

**Synthetic events don't trigger Mapbox layer clicks.** Mapbox's internal event system requires real user interactions to detect clicks on map layers. When testing:
- You cannot programmatically click on route lines using `MouseEvent`
- Use `window.dispatchEvent(new CustomEvent('route-select', { detail: { routeId } }))` to simulate what the map would do
- The Chrome DevTools MCP server can take screenshots but cannot trigger Mapbox layer events

### Browser Testing

Use Chrome DevTools MCP server for visual verification:
- Take screenshots to verify UI state
- Click on DOM elements (sidebar buttons work)
- Dispatch custom events to test event handlers
- Cannot test direct map layer interactions (requires manual testing)

## Content Backend (Payload + OSM)

**The public map reads trails from Payload**, falling back to the TypeScript data
in `src/data/` when there is no database — so the app still runs without one. Full guide:
[`docs/guides/osm-trail-editor.md`](docs/guides/osm-trail-editor.md). Rationale
and spike results:
[`docs/adr/0001`](docs/adr/0001-admin-ui-and-content-backend.md).

Payload 3 runs inside this Next app (admin at `/admin`, config at
`src/payload.config.ts`).

**The core idea: by default a trail does not own its geometry.** It stores the
OSM ways it rides on (`osmIds`), and the `resolveTrailGeometry` `beforeChange`
hook rebuilds `geom`, `distance`, `elevation*`, and `bounds` from Overpass +
Mapbox Terrain-RGB on save. `distance` and the elevation fields are always
read-only — they are measured from the line, never typed.

The admin has **one map** (`TrailMapEditor`, the "Trail geometry" field) with
three modes: **Pick ways** (the default), **Move points**, and **Draw**. When
OSM is wrong or missing, the latter two let a curator drag/insert/delete points
or draw a line from scratch. **The first such edit flips `geometrySource` to
`'edited'`**, which
stops the OSM rebuild for that trail — otherwise the next save would refetch the
ways and discard the edit. The line is then owned in the CMS; only the
measurements are still derived, via the same `measureParts` the OSM path uses.
"Discard edits and rebuild from OSM" reverses it.

- `src/payload/osm/overpass.ts` — fetch full-resolution ways by id (retry/backoff)
- `src/payload/osm/assemble.ts` — join ways end to end; report gaps, never drop
- `src/payload/osm/geometry.ts` — parse/validate `geom`; the editor's vertex ops
- `src/payload/osm/terrain.ts` — terrain sampling via `sharp` (Node has no canvas)
- `src/payload/osm/measure.ts` — distance/bounds/elevation, shared by both paths
- `src/payload/osm/build.ts` — orchestrates the OSM path
- `src/payload/components/TrailMapEditor.tsx` — the one admin map (pick/move/draw)
- `src/payload/read/trails.ts` — reads trails back out for the public map
- `src/payload/globals/Theme.ts` + `read/theme.ts` — admin appearance, editable
  at `/admin/globals/theme` and injected by the admin layout
- `src/payload/collections/{Organizations,TrailAreas}.ts` — the options behind
  the steward and trail-complex dropdowns. **Both are admin labels only**:
  "Steward" sits over the slug `organizations` and the field `organization`,
  as "trail complex" sits over `trail-areas`/`recArea`. Renaming either slug
  would mean a migration plus a sweep through the seeds and the read path. The sidebar hierarchy is
  **region → trail complex → trail**; "trail complex" is an admin **label**
  only, the slug/table stay `trail-areas` and the app field stays `recArea`
- `src/payload/collections/{TrailRatings,TrailKinds}.ts` — the difficulty and
  type vocabularies, also curated. See "Rating and kind are data" below
- `scripts/seed/{bend,chattanooga}.ts` — one script per city; their pipelines
  differ (Bend has osmIds + geometry, Chattanooga has neither), and **only Bend
  is seeded by default**

**How the public map gets its trails.** `src/app/(frontend)/page.tsx` is a
server component: it calls `getCityTrails()` (Payload's Local API — a typed
function call, no HTTP hop) and passes trails into `HomeClient` as props, which
publishes them to `src/data/trail-source.ts` during render. The page resolves
its city from the request hostname, so it reads `headers()` and renders per
request; `/api/map/trails` sends `Cache-Control: max-age=60`, so an admin edit
is live within a minute without a rebuild.

Things to know before touching it:

- **Never `import { mountainBikeTrails }`** — call `getMountainBikeTrails()`
  from `@/data/trail-source`. A `const` binding captures the checked-in data at
  import time and never sees the database rows. Anything derived from the list
  must be built lazily and invalidated via `onMountainBikeTrailsChange` — see
  the `trailByName` / `osmIdOwner` lookups in `utils/map.ts`.
- **`getCityTrails` never throws.** No `DATABASE_URL`, an unreachable database,
  or an empty result all return an empty list, and `setMountainBikeTrails`
  ignores an empty list so the checked-in data stays in place. Preserve that —
  losing the CMS must not take the public map down.
- **Bulk writes must pass `context: { skipOsmRebuild: true }`**, or the
  `beforeChange` hook fires one Overpass request per row and gets the machine
  rate-limited. Trails with `geometrySource: 'imported'` are skipped anyway.
- **The elevation chart comes from the database, and only from there.** The pane
  fetches `/api/map/elevation/<slug>`, which serves the `elevationProfile`
  measured on the trail's last save. The checked-in
  `public/data/elevation/*.json` files are **not** consulted: they cannot update
  themselves, so a trail whose ways had been adjusted kept drawing the old chart
  while the sidebar showed the new distance. They also only cover the two
  bundled cities, and this repo is meant to be stood up by any trail org — which
  has a database and none of those files. The files stay on disk for
  Chattanooga, whose geometry still lives in a Mapbox tileset; it gets its own
  CMS. **A trail with no row therefore has no chart** — that is the trade.
  `measureParts` was already sampling terrain to produce distance and gain and
  discarding the per-point series; don't drop it from either branch of
  `resolveTrailGeometry`. `pnpm backfill:elevation` measures any trail that has
  geometry but no profile, without touching Overpass.
- **`computeElevation`'s spike filter needs a run cap.** It replaces readings
  further than `ELEVATION_SPIKE_THRESHOLD` (25 m) from a running EMA. On a
  sustained climb the EMA lags by about `step * (1-alpha)/alpha`, and on a ~30%
  grade that lag alone crosses the threshold with no spike in the data. Because
  the filter holds its reference while rejecting, it could never catch up — one
  rejection 7% into O'Leary Mountain flatlined the remaining 92% of the trail
  and reported 449 ft of climbing on a trail that gains 3,200. Rejections are
  now capped at `ELEVATION_SPIKE_MAX_RUN` consecutive samples, after which the
  series is taken at face value. Don't remove the cap, and don't "simplify" the
  reject branch to advance the EMA from the substituted value — that is a no-op
  that reads like an update.
- **`slug` and `displayName` derive from `trailName`.** `DerivedTextField` fills
  them in live in the admin form, and the field `beforeValidate` hooks
  (`derivedFrom` in `Trails.ts`) do the same for REST, the seeds, and scripts —
  so `required` isn't a trap for anything that isn't the form. Both only ever
  fill a **blank**: display names are routinely deliberately different, and
  `slugify('Tiddlywinks (Upper)')` is `tiddlywinks-(upper)` against a stored
  `tiddlywinks-upper` whose static elevation file is named after it. Overwriting
  on open would break charts by looking at a page.
- **There is one user role: admin.** Everyone signed in can edit everything.
  Keep writing access rules as `req.user?.role === 'admin'` rather than
  `Boolean(req.user)` — that way a second role added later starts with no
  permissions and is granted them deliberately, instead of silently inheriting
  write access everywhere. `cityScoped` on Trails and the `city` field on a user
  are dead code today and kept for the same reason; the `city` field unhides
  itself once a non-admin role exists.
- **Rating and kind are data, not enums.** Both are `relationship` fields onto
  the `trail-ratings` / `trail-kinds` collections, so a curator can add a grade
  or a trail type without a deploy. Consequences worth knowing:
  - **Colour and icon come off those rows**, derived on read by `appearanceFor`
    (`src/payload/read/appearance.ts`) — the kind's colour wins when set (how
    greenways stay green at any difficulty), the rating's otherwise. Recolouring
    a grade in the admin repaints every trail with it; nothing stores a colour.
  - **`trail.rating` is still the app's plain string**, the row's `value`, with
    `'unrated'` flattened to `''` as it always was. `value` is the stable key —
    `name` is a label a curator may reword at any time, so never match on it.
  - **Anything keyed by rating must have a fallback.** A trail can now arrive
    carrying a grade the code has never seen; `shapeFor` in `MountainBikeTrails`
    is the pattern (a bare `TRAIL_SHAPE[rating]` miss collapsed the swatch).
  - **The defaults live in `src/data/trail-vocabulary.ts`** and are seeded by the
    migration, because the relationship is required — an empty vocabulary is a
    database you cannot create a trail in. `loadVocabulary` in `scripts/seed/`
    re-creates any that are missing and leaves existing rows untouched.
  - **Migrating this pair needs a backfill.** The generated migration drops the
    enum columns outright, which would blank every trail's rating and kind; the
    committed one seeds, backfills, *then* drops. Same trap as `trail-areas`.
- **Group trails with `regionOf(trail)`** (`@/data/trail-region`), never
  `regionFor(recArea)` directly. Trail areas carry an editable `region`;
  `regionOf` prefers it and falls back to the city's hardcoded `REGION_MAP`, so
  calling `regionFor` straight bypasses anything set in the admin.
- **The trail form's tabs must stay unnamed.** A named tab nests its fields
  under that key in the document *and* the database, so naming one renames every
  column and breaks the seeds, the read path, and the public map — for a layout
  change. After touching the form run `pnpm db:migrate:create`; it should say
  "No schema changes detected". Nav groups are **Trails / Lists / Settings**,
  and `geometrySource` lives in the sidebar so it stays visible from every tab.
  (The `vocabulary` in `loadVocabulary` / `defaultVocabularyId` /
  `trail-vocabulary.ts` is the data-model term and is unrelated to the nav
  label — don't rename those to match.)
- **`getTrailSummary` never throws**, same rule as `getCityTrails` and
  `getThemeCss` — it feeds the dashboard, which is the first page after signing
  in, so an exception there locks everyone out over a decorative panel. An
  unreachable database renders `—`, never `0`. Note one count is done in JS on
  purpose: `osmReport` is a plain `json` column and `osmReport.warnings.0`
  compiles to a jsonb path Postgres rejects.
- **Theme the admin with CSS variables, never Payload's selectors.** Defaults
  live in `src/app/(payload)/custom.css`; the DB-backed overrides come from the
  Theme global. Class names like `.btn__content` are internals that move between
  releases. `--theme-elevation-*` resolves to a `--color-base-*` scale that dark
  mode *inverts*, so retinting that ramp themes both modes at once.
- **`getThemeCss` never throws**, same rule as `getCityTrails` — a theme row
  must never lock anyone out of the admin. Its `customCss` is injected verbatim,
  so `sanitizeCss` strips `<`/`>`; don't remove that.
- **The project is ESM** (`"type": "module"` — Payload 3's CLI requires it). New
  root config files must be ESM or `.cjs`.
- **There is no root `src/app/layout.tsx`, on purpose.** Payload's `RootLayout`
  renders its own `<html>`/`<body>`, so a shared root layout would nest a second
  `<html>` inside it — which silently breaks the admin (inputs stop responding
  to clicks). The public app lives in `src/app/(frontend)/` with its own layout,
  Payload in `src/app/(payload)/`. **Don't add a layout at `src/app/`.**
- **Metadata files stay at `src/app/`**, not in a route group: `favicon.ico` and
  `manifest.ts` 404 from inside `(frontend)` because Next resolves them from the
  app root.
- **Never add a route at `/api/<collection-name>`.** Payload mounts its REST API
  at `/api/<collection>`, so such a route silently shadows that collection's
  list endpoint.
- **Geometry is stored as plain `jsonb`, deliberately.** It is a cache rebuilt
  from OSM, not a source of truth, so there is no PostGIS column. If spatial
  querying is ever needed, ADR-0001 records the cheap way to add it (a generated
  column) — don't hand-write a Drizzle `customType`.
- **Overpass is a shared community endpoint.** It rate-limits (429) and sheds
  load (504) routinely. The client retries with backoff; don't script bulk
  requests against the public instance.
- **Geometry rebuilds only when `osmIds` change** (or the line moves, for an
  edited trail), or when the `rebuildGeometry` checkbox is ticked. Don't make the
  hook unconditional — it costs an Overpass round trip plus terrain sampling.
- **Payload runs collection `beforeChange` hooks *before* field `validate`.** A
  field validator only ever sees what the hooks returned, so a server-side check
  that must not be bypassed belongs in the hook — that's why
  `resolveTrailGeometry` parses `geom` itself and throws a `ValidationError`.
  The field's `validate` still runs in the browser, which is its real job.
- **`push` is off**; the schema changes only through `pnpm db:migrate:create`.
  Re-run `pnpm generate:types` after any collection change and commit both.
- **Re-run `pnpm generate:importmap`** after adding or renaming an admin
  component, or Payload won't find it.
- **`TrailMapEditor`'s init effect must never re-run.** Its cleanup calls
  `map.remove()`, so any dependency that changes identity tears the map down
  mid-drag. Every callback it lists is `useCallback(fn, [])`; anything that
  varies (form values, `setValue`) is read from a ref. For the same reason
  nothing in it may `setState` at mousemove rate — that re-renders the entire
  Payload document form on every frame.
- **Terra Draw does the line editing** (`terra-draw` +
  `terra-draw-mapbox-gl-adapter`): drag/insert/delete points, snapping, and
  undo/redo. It edits `LineString`s, so parts map 1:1 to features via
  `partsToFeatures`/`featuresToParts`. Its `change` event can't distinguish our
  writes from a user's, so `loadingRef` guards the load — without it, opening a
  trail marks the form dirty and flips it to "Edited by hand".
- **Picking a way does not add it to the line.** Geometry is assembled from
  Overpass server-side on save, so a just-picked way has no editable points until
  then — `TrailMapEditor` tracks the ways the current line was built from and
  warns when they diverge. Selecting a feature also fires three `change` events,
  so `readBack` commits only when the line actually moved; otherwise clicking a
  line marks the trail "Edited by hand".
- **Terra Draw's undo/redo is opt-in.** Without the `undoRedo` constructor
  option, `undo()`/`redo()` exist and do nothing. `sessionLevel` undoes completed
  actions (a dragged point); `modeLevel` undoes steps inside an unfinished draw.
  Both are wired, plus keyboard shortcuts.
- **Right-click removes a point; `Delete` removes the whole piece** — and Terra
  Draw **cannot undo the second**, while `canUndo()`/`undo()` both claim success.
  Left-clicking a point then pressing `Delete` does *not* delete the point, it
  deletes the selected feature. `src/payload/osm/deleted-pieces.ts` snapshots the
  line whenever the piece count drops so the editor's Undo can restore it; the
  toolbar's `canUndo` is the union of that stack and Terra Draw's. Don't reword
  the Move points hint without re-reading `terra-draw-gestures.test.ts` — the
  hint used to recommend the destructive gesture as the way to remove a point.
- **Terra Draw features must carry `properties.mode`**, and `addFeatures`
  *returns* rejections instead of throwing (`{ valid: false, reason: 'Mode
  property does not exist' }`). Miss either and the line silently never enters
  the store — nothing renders or is grabbable, with nothing logged. Handles also
  only appear on a **selected** feature, hence the auto-select on entering Move
  points.
- **`draw.start()` must only run from `map.on('style.load')`.** The Mapbox
  adapter calls `addSource`/`addLayer` with no style-loaded guard, so starting it
  earlier throws `Style is not done loading` and takes the whole trail form down.
  `style.load` also fires after every `setStyle`, which discards the adapter's
  layers — `mountDraw` stops and restarts it there and re-adds the line.
- **Generated, lint-excluded**: `src/payload-types.ts`, `src/migrations/`,
  `src/app/(payload)/admin/importMap.js`.

## Configuration & Secrets

- Mapbox credentials belong in `.env.local`; see `.env.example` for required keys.
- Never commit secrets or `.env.local` to version control.
- `DATABASE_URL` and `PAYLOAD_SECRET` are only needed for the content backend.
