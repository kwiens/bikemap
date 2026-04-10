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

The mountain bike trails layer is a single Mapbox layer (`SORBA Regional Trails`) containing 220+ trails identified by the `Trail` feature property. Trail data is defined in `src/data/mountain-bike-trails.ts` (re-exported from `src/data/geo_data.ts`) with precalculated `defaultBounds` for zoom-to-fit and `distance` in miles. Code uses `MTN_BIKE_*` constants and `mountainBikeTrails` array — the `SORBA` prefix only appears in Mapbox tileset string values.

The source layer name and tileset ID change whenever GIS data is re-uploaded to Mapbox Studio. The constants `MTN_BIKE_SOURCE_LAYER` (in `mountain-bike-trails.ts`) and `MVT_TILESET` (in `scripts/add_trail_elevation.py`) must match the current tileset.

When trails are added or modified in the Mapbox tileset, run `scripts/add_trail_bounds.py` to recalculate bounding boxes and distances. The script takes raw coordinate data extracted from the Mapbox layer via Chrome DevTools console (see the script header for the extraction snippet) and computes both `defaultBounds` and `distance` fields.

#### Debugging Trails in Chrome DevTools

The map instance is exposed as `window.__map`. Use it to inspect layers and query trail features.

**Find the current source layer name** (needed when GIS data is re-uploaded):
```js
// Check what source-layer the SORBA style layer uses
__map.getStyle().layers.find(l => l.id === 'SORBA Regional Trails')

// List all source-layers in the composite source
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

**List all trail names** (pan to the area first — `querySourceFeatures` only returns loaded tiles):
```js
[...new Set(__map.querySourceFeatures('composite',
  {sourceLayer: '<CURRENT_SOURCE_LAYER>'}).map(f => f.properties.Trail))].sort()
```

**Inspect a specific trail's properties**:
```js
__map.querySourceFeatures('composite', {sourceLayer: '<CURRENT_SOURCE_LAYER>'})
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
