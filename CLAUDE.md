# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### SORBA Mountain Bike Trails

The SORBA Regional Trails layer is a single Mapbox layer (`SORBA Regional Trails`, source layer `SORBA_Regional_Trails-1oj4dx`) containing 220+ trails identified by the `Trail` feature property. Trail data is defined in `src/data/geo_data.ts` with precalculated `defaultBounds` for zoom-to-fit and `distance` in miles.

When trails are added or modified in the Mapbox tileset, run `scripts/add_trail_bounds.py` to recalculate bounding boxes and distances. The script takes raw coordinate data extracted from the Mapbox layer via Chrome DevTools console (see the script header for the extraction snippet) and computes both `defaultBounds` and `distance` fields in `geo_data.ts`.

## Code Style

- Do not include "Co-Authored-By: Claude" in commit messages
- Use `function` keyword for pure functions and components
- Prefer interfaces over type aliases; avoid enums (use maps)
- Use functional components; minimize `use client`
- File order: exported component → subcomponents → helpers → static content → types
- Use existing icon libraries (Font Awesome or lucide-react) - don't add new ones
- Directories use lowercase-dash naming

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
