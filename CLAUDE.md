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

## Architecture

This is a Next.js 15 App Router application displaying an interactive Mapbox map of Chattanooga bike routes and resources.

### Core Data Flow

1. **Page Entry** (`src/app/page.tsx`): Dynamically imports Map component with SSR disabled (Mapbox requires browser)
2. **Map Component** (`src/components/Map.tsx`): Main orchestrator that initializes Mapbox, manages markers, and handles custom events
3. **Data Sources** (`src/data/`):
   - `geo_data.ts`: Static data for bike routes, attractions, bike shops (BikeRoute, MapFeature, BikeResource interfaces)
   - `gbfs.ts`: Live bike share station data from Chattanooga GBFS API

### Event-Driven Communication

The app uses custom DOM events for component communication:
- `route-select`: Highlights a bike route and zooms to its bounds
- `layer-toggle`: Shows/hides marker layers (attractions, bikeResources, bikeRentals)
- `center-location`: Pans map to a specific location
- `route-deselect`: Resets route opacity
- `sidebar-toggle`: Triggers map resize after sidebar animation

### Marker System

`MapMarkers.tsx` provides factory functions for different marker types and a `MarkerManager` class for bulk operations. Markers are pre-created at init but only added to map when their layer is toggled on.

### Map Styling

Routes are styled via Mapbox Studio (referenced by layer IDs like `riverwalk-loop-v3-public`). Route bounds are calculated from layer features at runtime to enable zoom-to-fit.

## Code Style

- Use `function` keyword for pure functions and components
- Prefer interfaces over type aliases; avoid enums (use maps)
- Use functional components; minimize `use client`
- File order: exported component → subcomponents → helpers → static content → types
- Use existing icon libraries (Font Awesome or lucide-react) - don't add new ones
- Directories use lowercase-dash naming
