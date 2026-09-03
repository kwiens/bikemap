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

This is a Next.js App Router application displaying an interactive Mapbox map of bike routes, trails, and resources. It is **multi-city**: Chattanooga, TN ([bikechatt.com](https://bikechatt.com)) and Bend, OR (ridebend.org) run from the same codebase, selected per-request by hostname (or `NEXT_PUBLIC_CITY_ID` in development).

### Project Structure

```
src/
├── app/                    # Next.js App Router pages (/, /about, /export)
├── components/
│   ├── Map.tsx            # Main map orchestrator (init, markers, custom events, GPS)
│   ├── MapLegend.tsx      # Sidebar container with state management
│   ├── MapMarkers.tsx     # Marker factory and MarkerManager class
│   ├── RidesPanel.tsx     # Ride recording controls + history panel
│   ├── WelcomeModal.tsx   # First-run onboarding & ride-style preference
│   ├── PwaInstallPrompt.tsx
│   └── sidebar/           # Sidebar components
│       ├── BikeRoutes, MountainBikeTrails, MapLayers(Section), BikeNetworkLayer
│       ├── AttractionsList, BikeResourcesList, BikeRentalList (LocationList shared base)
│       ├── ElevationProfile.tsx  # Bottom elevation pane (trails, OSM ways, rides)
│       ├── RideHistory.tsx, RideDetail.tsx
│       ├── SidebarCard.tsx, ToggleSwitch.tsx, a11y.ts (pressableProps)
│       ├── types.ts       # Shared interfaces
│       └── index.ts       # Barrel export
├── config/
│   ├── map.config.ts      # Per-city geo config + city resolution (hostname/env)
│   └── site.config.ts     # Per-city branding (name, URL, theme, storage prefix)
├── data/
│   ├── cities/            # THE city registry: types.ts (CityData contract),
│   │   │                  # index.ts (cityDataById + activeCityData)
│   │   ├── chattanooga/   # Chattanooga CityData (arrays live in top-level src/data/*)
│   │   └── bend/          # Bend CityData + data files
│   ├── geo_data.ts        # Barrel over activeCityData — components import from here
│   ├── mapbox-style.ts    # What the shared Studio style bakes in (style-owned layers)
│   ├── bike-routes|map-features|bike-resources|local-resources.ts  # Types + Chattanooga data
│   ├── mountain-bike-trails(.data).ts  # MTB types/constants + Chattanooga trail array
│   ├── trail-metadata.ts  # Rating→color palette (trailColor) + GIS name metadata
│   ├── osm-trails.ts      # Nationwide OSM trails layer constants
│   ├── bike-network.ts    # Classified bike-network overlay constants
│   ├── ride.ts            # Ride recording types
│   └── gbfs.ts            # Live bike share API integration (station + free-bike)
├── hooks/                 # useRideRecording, useWakeLock, useMapResize, useToast
├── utils/
│   ├── map.ts             # Map layer plumbing, selection, bounds, geocoding
│   ├── terrain-rgb.ts     # Shared Terrain-RGB decode + tile math
│   ├── dem.ts             # Ride elevation correction (pre-cached z13 tiles)
│   ├── osm-elevation.ts   # OSM trail elevation (live z14 tiles + precomputed)
│   ├── ride-stats.ts, ride-storage.ts (IndexedDB), gpx.ts, compass.ts
│   ├── request-hostname.ts # Server-side hostname resolution (shared by layout/manifest/about)
│   └── format.ts, settings.ts, string.ts, svg.ts, html.ts
├── events.ts              # MAP_EVENTS — all custom DOM event names
└── lib/utils.ts           # cn() — clsx + tailwind-merge
```

### Multi-City Architecture

- **`src/data/cities/types.ts`** defines `CityData` — the contract for what a city provides (routes, features, resources, MTB trail config, regionFor, optional `bikeNetworkUrl`/`bikeRoutesUrl`).
- **`src/data/cities/index.ts`** registers cities in `cityDataById` and exposes `activeCityData`.
- **City resolution** happens in `map.config.ts`: `resolveActiveCityId()` checks the hostname against `NEXT_PUBLIC_CITY_HOST_MAP`, falling back to `NEXT_PUBLIC_CITY_ID`, then Chattanooga. `parseCityId` derives valid ids from `cityConfigs` keys — adding a city to the registry is sufficient. Server components (`layout.tsx`, `manifest.ts`, `about/page.tsx`) resolve per-request via `getRequestHostname()`; client code binds `activeCityData` at module load (works because the map is client-only).
- **Style ownership** (`src/data/mapbox-style.ts`): the shared Mapbox Studio style is Chattanooga's. `hiddenStyleLayerIdsFor(city)` computes which style-baked route layers a city must hide (everything it doesn't own) — a new city never imports another city's data.
- **Per-city static data** lives under `public/data/<city>/` (GeoJSON) and `public/data/elevation/<city>/` (per-trail elevation JSONs — city-scoped so same-named trails can't collide).
- Adding a city: extend `CityId`, add a `MapConfig` + `SiteConfig`, create `src/data/cities/<city>/`, register it in `cityDataById`, add the hostname to `NEXT_PUBLIC_CITY_HOST_MAP`, and provide `public/data/<city>/` assets.

### Core Data Flow

1. **Page Entry** (`src/app/page.tsx`): Dynamically imports Map component with SSR disabled (Mapbox requires browser)
2. **Map Component** (`src/components/Map.tsx`): Main orchestrator that initializes Mapbox, manages markers, and handles custom events
3. **Data Sources** (`src/data/`):
   - `geo_data.ts`: barrel re-exporting the **active city's** data (`bikeRoutes`, `mapFeatures`, `bikeResources`, `mountainBikeTrails`, `elevationBasePath`, ...) — components import from here and stay city-agnostic
   - `gbfs.ts`: live bike share data (station-based for Chattanooga, free-bike/Veo for Bend — a discriminated `GBFSConfig` union)

### Event-Driven Communication

The app uses custom DOM events (`window.dispatchEvent`) for component communication. **All event names live in `src/events.ts` (`MAP_EVENTS`)** — never use string literals. The full set:

| Event | Purpose |
|-------|---------|
| `route-select` / `route-deselect` | Curated route selection (bidirectional Map ⇄ sidebar; deselect resets route opacity on the map) |
| `trail-select` / `trail-deselect` | Curated MTB trail selection (bidirectional; drives elevation pane) |
| `osm-trail-select` | Nationwide OSM trail clicked — carries a ready-built `ElevationProfile` |
| `area-select` | Rec-area heading clicked — zoom to area bounds |
| `layer-toggle` | Show/hide a layer: `attractions`, `bikeResources`, `bikeRentals` (radio-style markers), `osmTrails`, `bikeNetwork` |
| `center-location` | Pan map to a location (and open its popup) |
| `sidebar-toggle` | Sidebar opened/closed — map resize + elevation pane layout |
| `elevation-hover` | Elevation chart hover — moves the map hover marker |
| `location-update` | GPS fix — recenter / elevation-pane location dot |
| `ride-style-chosen` | Welcome modal preference — selects default sidebar tab |
| `ride-recording-start/stop/update` | Ride recorder lifecycle → live map track |
| `ride-select` / `ride-deselect` | Saved ride selection (map track + elevation pane + panel) |
| `rides-panel-toggle` | Rides panel opened/closed (closes the sidebar, with a `sidebar-toggle` dispatch) |
| `toast` | Show a toast via the map's toast host |
| `map-ready` | Map fully initialized (also sets `window.__mapReady` for late listeners) |

**Important**: `route-select` and `trail-select` are bidirectional — both Map and MapLegend listen. When clicking on the map, the map dispatches and MapLegend updates its selection state; when clicking in the sidebar, MapLegend dispatches and Map handles the visual update. Event payloads are untyped (`CustomEvent.detail`) — check the dispatching site for the shape.

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
- `public/data/elevation/chattanooga/{slug}.json` — per-trail elevation profile (distance, gain, loss, min, max, coordinate samples). Elevation JSONs are city-scoped: Bend's live in `public/data/elevation/bend/` (written by `scripts/build_bend_trails.py`), and the client fetches from `elevationBasePath` (`geo_data.ts`).
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

### Embed Mode (`/embed`)

The map can be framed on third-party sites via `<iframe src="https://bikechatt.com/embed?...">`. `EmbedSnippetBuilder` (`src/components/embed/`) takes its routes and available layers as a prop from `embedBuilderConfig()` (`src/utils/embed-options.ts`), resolved server-side from the request hostname — it must never import `@/data/geo_data`, which binds the active city at module load and so resolves to the default city during SSR. It is the self-serve setup form — controls, a live preview, and a copy-paste snippet — rendered in two places: the **About page** (the canonical place partners are pointed at) and `/embed/demo`, a mock partner page showing the embed in context. It renders no heading of its own, so each host page supplies its own; it validates `center` with the embed's own `parseCenter` so the form can't accept a value the map would drop.

- **Everything is URL-driven.** `parseEmbedOptions` / `buildEmbedSearch` in `src/utils/embed.ts` are the single encoder/decoder for the supported params (`sidebar`, `route`, `center`, `zoom`, `layers`). Never rely on cookies or `localStorage` in embed mode — browsers drop the settings cookie (no `SameSite=None`) and partition storage inside a third-party frame. Anything that also needs a decoded param (e.g. `useUrlDeepLink`) takes it as an argument rather than re-reading the query string, so there is exactly one decoder.
- **`layers` keeps at most one marker layer.** `attractions` / `bikeResources` / `bikeRentals` (`MARKER_LAYERS`) are a radio group in the map — `handleLayerToggle` hides the others when one is shown — so `parseLayers` keeps only the first of them and drops the rest; `bikeNetwork` is an independent line overlay and may accompany it. The snippet builder mirrors this with a radio group so a partner cannot generate an impossible combination.
- **Embed mode skips the trail stack entirely.** `Map.tsx` gates `ensureMtnBikeSource` / `initMtnBikeLayers` / `ensureOsmTrailsSource` / `registerOsmTrailSelection` on `!isEmbed`. That keeps two vector sources and their tile traffic off the critical path on a partner's page, and — just as important — stops trail lines being clickable when there is no trails UI to show the result.
- **`EmbedProvider` / `useEmbed()`** (`src/components/EmbedContext.tsx`) is how `Map.tsx` and `MapLegend.tsx` learn they are embedded. Outside `/embed` the context defaults to `isEmbed: false`, so the main app never branches on it. In embed mode: Casual (routes) tab only, no MTB pill, sidebar closed by default, no `RidesPanel` / `WelcomeModal` / `PwaInstallPrompt`, no cookie writes, and an `EmbedAttribution` "Open in …" link overlays the map.
- **Framing headers** come from `embedHeaders()` in `src/utils/embed-headers.ts`, wired into `next.config.ts`. `/embed` — that exact path, not a prefix — gets `frame-ancestors` from the `EMBED_ALLOWED_ORIGINS` env var (unset = any site); every other path, `/embed/demo` included, gets `frame-ancestors 'self'`. The two `source` patterns must stay mutually exclusive: Next appends the headers of every matching rule and browsers intersect multiple CSPs, so an overlap silently applies the stricter one and blanks the frame. `EMBED_ALLOWED_ORIGINS` is read at **build** time, so changing it needs a redeploy. The Mapbox token's URL restriction keeps working because the iframe document's origin is ours.
- **Partner snippet requirements:** `allow="geolocation; fullscreen; gyroscope; accelerometer; magnetometer"` for locate-me/compass, and an explicit height (the snippet uses `aspect-ratio`). `public/register-sw.js` skips registration inside frames.
- CORS is not involved: the iframe runs on our origin, so tile/GBFS/data fetches are unchanged. Parent↔iframe control, if ever needed, is a `postMessage` adapter over `MAP_EVENTS` with an origin check.

### The map-ready handshake

`src/utils/map-ready.ts` owns the `window.__mapReady` flag. Anything that must act "once the map exists" calls `onMapReady(cb)`, which runs the callback immediately if the map is already up and otherwise waits for `MAP_READY` — returning an unsubscribe suitable for a `useEffect`. `Map.tsx` calls `setMapReady()` on init and **`clearMapReady()` on teardown**: the flag describes the current map instance, and a stale `true` makes listeners on a remounted tree (Strict Mode's double-mount, Fast Refresh) dispatch into a torn-down map having skipped the listener that would have recovered them. Don't read or write `window.__mapReady` directly.

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

Coverage spans ~30 test files: map utilities (`src/utils/map.test.ts`), config/city selection (`src/config/map.config.test.ts`), GBFS (`src/data/gbfs.test.ts`), ride recording/stats/storage (`src/hooks/useRideRecording.test.ts`, `src/utils/ride-*.test.ts`, `src/utils/elevation-accuracy.test.ts`), elevation (`dem`, `osm-elevation`, `gpx`), and components (`MapLegend`, `RidesPanel`, sidebar components). `src/components/Map.tsx` has no tests (known gap — see the deferred GPS/compass hook extraction).

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

## Configuration & Secrets

- Mapbox credentials belong in `.env.local`; see `.env.example` for required keys.
- Never commit secrets or `.env.local` to version control.
