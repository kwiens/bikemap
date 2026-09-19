# Repository Guidelines

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server at localhost:3000
pnpm build        # Build for production
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm check        # Run ESLint, Biome formatting, types, and Knip
pnpm lint:fix     # Auto-fix ESLint and formatting issues
pnpm dedupe:check # Verify the lockfile has no avoidable duplicates
```

Content backend (Payload + OSM — see below):

```bash
pnpm db:up              # Start local Postgres via docker compose
pnpm db:migrate         # Apply migrations
pnpm db:seed:bend       # Import Bend's trails and Casual routes
pnpm db:seed:bend-routes # Sync only Bend's 8 Casual routes (also runs on deploy)
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

GitHub posts written by an agent start with `🤖` alone on the first line. This
applies to issue and pull-request bodies, comments, reviews, and review-thread
replies. Do not add the marker to commits, titles, or file contents.

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

1. **Page Entry** (`src/app/(frontend)/page.tsx`): Reads CMS trails and routes on the server, then renders `HomeClient.tsx`, which dynamically imports Map with SSR disabled
2. **Map Component** (`src/components/Map.tsx`): Main orchestrator that initializes Mapbox, manages markers, and handles custom events
3. **Data Sources** (`src/data/`):
   - `geo_data.ts`: barrel re-exporting the **active city's** static config (`mapFeatures`, `bikeResources`, route/network URLs, and trail-layer config). Published lists come from `route-source.ts` and `trail-source.ts`.
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

Route display metadata is keyed by stable layer IDs such as `riverwalk-loop-v3-public`. Geometry may come from Mapbox Studio or the configured city GeoJSON/API. Chattanooga's imported Riverwalk geometry comes only from Payload; its same-named Studio layer must stay disabled even when the database is unavailable or unseeded.

### Mountain Bike Trails

The MTB trails layer contains 220+ trails identified by the `Trail` feature
property. The checked-in fallback metadata (`mountainBikeTrails`) lives in
`src/data/mountain-bike-trails.data.ts`; Payload replaces it at runtime after a
city is seeded.

#### Chattanooga regional GIS → Payload

Chattanooga's main regional layer no longer renders from a custom Mapbox
tileset. Its permitted `Chattanooga_Regional_Trails_4` shapefile is converted
from NAD83 / UTM zone 16N to WGS84 GeoJSON by
`scripts/prepare_chattanooga_trails.py`:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/prepare_chattanooga_trails.py /path/to/Chattanooga_Regional_Trails_4.shp
pnpm prepare:chattanooga-measurements
pnpm db:seed:chattanooga
```

The converter writes `public/data/chattanooga/trails.geojson`, grouping source
pieces into one `MultiLineString` per raw `Trail` value. The seed matches those
names against the 224 curated rows and stores geometry as
`geometrySource: 'imported'`; 218 match. The six Godsey Ridge trails remain in
the separate `Godsey Ridge Trails` style layer because that geometry was not in
the regional shapefile. `prepare:chattanooga-measurements` uses the same
`measureParts` implementation as Payload to regenerate summary metadata and
the city-scoped static profiles from those exact 218 lines. The seed imports
the prepared profile alongside each line; never seed after changing the
GeoJSON without regenerating these artifacts first.

`ensureMtnBikeSource(map)` attaches `MTN_BIKE_SOURCE_ID` as GeoJSON, reads
`/api/map/trails?city=chattanooga`, and falls back to the checked-in GeoJSON if
the database is unavailable or unseeded. `initMtnBikeLayers` filters every
name-based source to the curated trail list, so retired/non-MTB source features
cannot appear as unselectable gray lines.

The Godsey Ridge layer (`Godsey Ridge Trails`, source-layer `LineStrings`) is
still baked into the Mapbox Studio style, so only its casing/glow/hit sublayers
are added at runtime.

To inspect the database-backed layer in Chrome DevTools:

```js
__map.getSource('mtb-trails-source')
__map.getLayer('mtb-trails')
[...new Set(__map.querySourceFeatures('mtb-trails-source')
  .map(f => f.properties.Trail))].sort()
```

The older elevation-generation script still reads the historical Mapbox vector
tileset as an offline input. That constant is local to
`scripts/add_trail_elevation.py`; it is no longer a runtime map dependency.

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
- Include units in names when the unit is not obvious (`retryDelayMs`,
  `distanceMeters`) and phrase booleans as questions (`isLoading`, `hasRoute`).
- Prefer precise domain verbs and nouns. Do not create catch-all `Utils`,
  `Helpers`, or `Managers` when a narrower responsibility can be named.
- Comments explain constraints and why a choice exists; do not narrate code that
  is already clear from its names and structure.
- State the bound for data-dependent loops. Batch independent network or
  database work, avoid accidental serial round trips, and fetch only the fields
  a caller needs.

### Dependency hygiene

- Pin direct dependencies and dev dependencies to exact versions. Let
  Dependabot make version changes explicitly rather than widening manifest
  ranges.
- Keep `@types/node` on the same major as the Node runtime in `.nvmrc`.
- After changing dependencies, run `pnpm install`, `pnpm dedupe`, and
  `pnpm dedupe:check`; commit the resulting lockfile.

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
- `src/payload/collections/Routes.ts` + `src/payload/read/routes.ts` — Casual
  route records and the public map read path. A route either owns imported
  geometry or selects a same-city Trail and reuses that trail's current
  geometry, distance, and bounds. Casual reads Routes only; linking a Trail is
  how a curator exposes it there without duplicating its line. Use
  `pnpm db:import:chattanooga-routes` rather than committing generated route
  GeoJSON. Bend's seed derives its eight imported routes directly from the
  committed bike-network source.
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
  differ (Bend has OSM-referenced geometry; Chattanooga imports an archived GIS
  snapshot without osmIds), and **only Bend is seeded by default**

**How the public map gets its trails and routes.** `src/app/(frontend)/page.tsx` is a
server component: it calls `getCityTrails()` (Payload's Local API — a typed
function call, no HTTP hop) plus `getCityRoutes()`, and passes both into
`HomeClient` as props. The client publishes them to `src/data/trail-source.ts`
and `src/data/route-source.ts` during render. The page resolves
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
- **The elevation chart prefers the database, with a city-scoped static fallback.**
  The pane fetches `/api/map/elevation/<slug>?city=<city>`, serving the profile
  measured on the trail's last save. A miss falls back to
  `public/data/elevation/<city>/<slug>.json`, which keeps charts working for
  unseeded Chattanooga deployments and installations without a CMS. Keep the
  city in both lookups so same-named trails cannot collide. Chattanooga's seed
  imports its prepared profiles directly; `pnpm backfill:elevation` measures
  any trail that still has geometry but no profile, without touching Overpass.
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
