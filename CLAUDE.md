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

The MTB trails layer contains 220+ trails identified by the `Trail` feature property. Trail data is defined in `src/data/mountain-bike-trails.ts` (re-exported from `src/data/geo_data.ts`) with precalculated `defaultBounds` for zoom-to-fit and `distance` in miles. Code uses `MTN_BIKE_*` constants and the `mountainBikeTrails` array everywhere — names like "SORBA" only appear when referring to the upstream GIS dataset.

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
- Updates `src/data/mountain-bike-trails.ts` — summary stats (distance, elevationGain, elevationLoss, elevationMin, elevationMax)

#### Adding a New Trail

1. Find the trail name in Chrome DevTools (see above)
2. Add an entry to the `mountainBikeTrails` array in `src/data/mountain-bike-trails.ts` with `trailName`, `displayName`, `recArea`, `rating`, `color`, and `icon`
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
- Clickable: a transparent extra-wide hit layer (`OSM_TRAILS_HIT_LAYER_ID`) is
  the tap target; `registerOsmTrailPopup` opens a Mapbox popup built by
  `buildOsmTrailPopupHTML` (in `osm-trails.ts`) from the feature's OSM tags —
  name, a difficulty badge (from `mtb:scale`, raw scale not shown), type,
  surface, bike access, plus a "View on OpenStreetMap" link. OSM values are
  HTML-escaped. Popup styling lives in `osm-trail-*` classes in `app/map.css`.

#### Precomputed length + elevation

OSM trail tiles carry no length or elevation. On click we want both instantly
instead of sampling Mapbox Terrain-RGB in the browser every time, so a batch
tool precomputes them offline per region (sharded for an eventual nationwide
run) and the popup falls back to client sampling only on a miss.

- **Tool**: `scripts/osm_trail_elevation.py`. Geometry comes from the **Overpass
  API** (not the vector tiles — Overpass gives full-resolution ways + real OSM
  ids that match the tileset's `OSM_ID`, and one query beats tens of thousands of
  z14 tile requests for a whole state). The Overpass query mirrors
  `OSM_BIKE_TRAIL_FILTER`. Elevation comes from Mapbox Terrain-RGB at z14, run
  through a Python port of `computeElevation` (`src/utils/ride-stats.ts`) so the
  precomputed numbers match the client's on-demand fallback. Overpass needs a
  `User-Agent` header (else HTTP 406). Responses and terrain tiles are disk-cached
  (`scripts/.osm_cache/`, `scripts/.tile_cache/terrain14/`, both gitignored) so
  reruns are cheap and a national run is resumable. Both stages (Overpass cell
  fetches and per-way terrain sampling) run across a thread pool — `--workers`
  (default 3); the terrain-tile cache is thread-safe with per-tile locks.

  ```bash
  python scripts/osm_trail_elevation.py --region oregon          # one state
  python scripts/osm_trail_elevation.py --bbox=-124.6,41.9,-116.4,46.3 --region-name oregon
  python scripts/osm_trail_elevation.py --region all             # every US state (long!)
  python scripts/osm_trail_elevation.py --region oregon --workers 6
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
  `registerOsmTrailPopup` (`utils/map.ts`) renders precomputed values immediately
  (`elevationStatus: 'ready'`, no terrain fetch) and falls back to
  `sampleTrailElevation` only when there's no precomputed entry.

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

## Configuration & Secrets

- Mapbox credentials belong in `.env.local`; see `.env.example` for required keys.
- Never commit secrets or `.env.local` to version control.
