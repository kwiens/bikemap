# Plan: De-Mapboxing Open Bike Map

- **Status:** Proposed — plan only, nothing here is built yet
- **Date:** 2026-08-14
- **Relates to:** ADR-0001 (PR #100), which flagged that `mapbox-gl` v3 is not
  free software and named MapLibre as needing its own decision. This is that
  decision, drafted as a plan.

## Why

Three reasons, in order of weight:

1. **License coherence.** This app is GPLv3, but `mapbox-gl` v3 left BSD at v2
   and is now proprietary — we compile a non-free library into a copyleft app.
   MapLibre GL JS (BSD-3, community fork of mapbox-gl v1.x) removes the
   contradiction.
2. **Fork cost.** The federated vision is many trail orgs running their own
   deployments. Today every fork must create a Mapbox account, build a Studio
   style, and manage a token — and the upstream style silently blanks the whole
   basemap under any other token (its `composite` mixes private `swuller.*`
   tilesets). The heaviest step in DEPLOYING.md exists only because of Mapbox.
3. **No single vendor chokepoint.** An open ecosystem of trail maps shouldn't
   route every deployment's rendering, terrain, and geocoding through one
   proprietary vendor's rate limits and pricing.

## What actually depends on Mapbox today

Surveyed 2026-08-14 on `main` (+ PR #100/#109 branches where noted).

| # | Dependency | Where | Replacement |
|---|---|---|---|
| D1 | `mapbox-gl` v3 (the library) | `Map.tsx`, `MapMarkers.tsx`, `utils/map.ts`, `app/export/page.tsx`, `hooks/useMapResize.ts`, CSS import in `app/layout.tsx` | **MapLibre GL JS** |
| D2 | Studio basemap style `swuller/cm91zy289001p01qu4cdsdcgt` — basemap + Chattanooga route line layers + Godsey Ridge layer + Maki sprite icons for OSM POIs | `map.config.ts`, route layer IDs in `bike-routes.ts` | **Open basemap style** (OpenFreeMap default; self-hosted PMTiles option) + all overlay layers moved to runtime sources |
| D3 | Hosted MTB vector tileset `mapbox://swuller.ccfw1cmr` | `MTN_BIKE_TILESET_URL` in `mountain-bike-trails.ts`, attached at runtime | **GeoJSON from the app** (PR #100 already moves trail geometry to Postgres/OSM) |
| D4 | Terrain-RGB elevation tiles | Client: `utils/osm-elevation.ts` (per-click sampling), `utils/dem.ts` + `public/terrain/` (21 MB cached tiles). Scripts: `add_trail_elevation.py`, `osm_trail_elevation.py`, `build_bend_trails.py` | **AWS Terrain Tiles** (Terrarium encoding, free, no token) |
| D5 | Geocoding API (`mapbox.places`) | `utils/map.ts:1327`, single call site | **Nominatim or Photon** (OSM geocoders) |
| D6 | Token plumbing | `NEXT_PUBLIC_MAPBOX_TOKEN` / `NEXT_PUBLIC_MAPBOX_STYLE_URL`, `mapboxgl.accessToken`, docs | Deleted (or reduced to an optional basemap-provider key) |

What we do **not** use, which keeps this tractable: no `setTerrain`/3D terrain,
no fog/sky, no `queryTerrainElevation`, no GeolocateControl (location tracking
is custom), no Mapbox Directions/Static Images/Standard style. The GL API
surface is `Map`, `Marker`, `Popup`, `LngLatBounds`, `NavigationControl`,
expressions, and sources/layers — all of which MapLibre implements with the
same signatures.

## Replacement choices

### Library — MapLibre GL JS

Drop-in for our API surface. The mechanical delta:

- `import mapboxgl from 'mapbox-gl'` → `import maplibregl from 'maplibre-gl'`
  (~6 files; consider a single re-export module `src/lib/gl.ts` so the next
  swap is one line).
- Delete `mapboxgl.accessToken` (5 sites). MapLibre has no token concept.
- CSS: `maplibre-gl/dist/maplibre-gl.css` in `app/layout.tsx`.
- Types: `mapboxgl.Expression` → `ExpressionSpecification`,
  `AnyLayer`/`LayerSpecification` → `LayerSpecification`,
  `FilterSpecification` unchanged in name. Expressions themselves are the same
  style-spec language — our color/opacity/filter expressions port verbatim.
- `mapbox://` URLs are not resolvable by MapLibre — which is fine, because
  removing them is the point (D2/D3). We do the library swap and the basemap
  swap in the same phase to avoid building a throwaway `transformRequest` shim.

### Basemap — OpenFreeMap default, PMTiles for self-hosters

- **Default: OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`).
  Free hosted OpenMapTiles-schema vector tiles, no API key, no account, no
  usage cap, funded/donated infra. A fork gets a working worldwide basemap
  with zero signup — this single choice deletes DEPLOYING.md step 2.
- **Self-host option: Protomaps PMTiles.** One static file on any host/R2
  bucket serves the whole planet (~100 GB) or one region (~100s of MB via
  `pmtiles extract`). Documented as the "your org controls everything" path,
  consistent with the federation story. Not the default because it's a real
  hosting step.
- **Style:** start from OpenFreeMap's Liberty style JSON, checked into the
  repo (`src/styles/basemap.json` or fetched + themed at runtime), with our
  bike-oriented tweaks layered on: de-emphasize motorways, keep path/cycleway
  casing visible at low zoom, our fonts/colors. Checked in = versioned,
  reviewable, forkable — the anti-Studio.
- **Icons:** the OSM POI layer uses two Maki icons (`parking`,
  `information`). Maki is CC0 — build a tiny self-hosted sprite (spreet) or
  add the two images via `map.addImage()` at runtime.

### Overlay data — finish what PR #100 started

The Studio style currently carries data that isn't basemap: Chattanooga's
route line layers, the Godsey Ridge trails layer, and the hosted MTB tileset
attached at runtime. Post-#100, curated trails are GeoJSON served from
Postgres (`/api/map/trails`), which already removes D3 for the Payload path.
Remaining work:

- Chattanooga's `BikeRoute` layers: export from Studio (or re-derive from OSM
  relations, which is the better federation answer) into GeoJSON rendered via
  the existing `INLINE_ROUTES_SOURCE_ID` path — the code path already exists
  for Bend.
- Godsey Ridge: same treatment; it's a small layer.
- The runtime `ensureMtnBikeSource` tileset attach becomes dead code once
  Chattanooga's 220 trails are served like Bend's (blocked on the
  "does Chattanooga generalise?" question in ADR-0001 — the name/geometry
  match against OSM).

### Terrain — AWS Terrain Tiles (Terrarium)

`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` — the
Mapzen-lineage DEM on AWS Open Data. Free, no token, no usage agreement.

- Decode changes from Mapbox's formula to Terrarium's:
  `elevation = (R * 256 + G + B / 256) - 32768`. Today the decode exists in
  **five places**: `osm-elevation.ts`, `dem.ts`, and the three Python scripts.
  Consolidate to one TS helper + one Python helper *first*, then swap the
  formula and URL in exactly two places.
- Regenerate `public/terrain/` (21 MB, z13 Chattanooga) from Terrarium, and
  write the small fetch script DEPLOYING.md step 8 admits doesn't exist yet.
- **Expect numbers to move.** Different DEM lineage means gain/loss/min/max
  shift slightly. Rerun the elevation backfill everywhere in one pass and
  eyeball the diffs (ADR-0001's spike showed 2917/2917 and 4079/4083 ft
  agreement between two Mapbox paths; cross-DEM deltas will be larger but
  should stay within tens of feet). Tolerance check goes in the backfill
  script, not in review eyeballs.

### Geocoding — Nominatim

One call site, low volume (address search box). Public Nominatim with a
proper `User-Agent` and its 1 req/s policy is adequate; Photon
(photon.komoot.io) is the typo-tolerant alternative if search-as-you-type is
ever wanted. Configurable endpoint so a fork can point at its own instance.

## Phases

Ordered so each lands green and shippable; 1–2 are the big one and go
together.

| Phase | What | Size |
|---|---|---|
| **0. Prep** | Add `license` to `package.json` (flagged in ADR-0001, still missing). Consolidate the five Terrain-RGB decoders to two. Export Chattanooga route + Godsey GeoJSON from Studio while we still have the account handy. | S |
| **1+2. Library + basemap** | mapbox-gl → maplibre-gl; checked-in Liberty-based style; overlay layers to runtime sources; Maki sprite; delete token plumbing from the map path; `export/page.tsx` too. | L |
| **3. Terrain** | Terrarium URL + decode in the two consolidated helpers; regenerate `public/terrain/`; write the tile-fetch script; rerun elevation backfill; tolerance report. | M |
| **4. Geocoding** | Nominatim swap, configurable endpoint. | S |
| **5. Cleanup + docs** | Remove `NEXT_PUBLIC_MAPBOX_*`; rewrite DEPLOYING.md steps 2/6/8 (they mostly disappear); update CLAUDE.md's Mapbox debugging sections; document the PMTiles self-host path. | M |

**Sequencing against open PRs:** phases 1–2 touch `Map.tsx`/`utils/map.ts`,
which #100/#109 also touch. Land #100 and #109 first — and #100 independently
deletes most of D3. Doing this before them would force painful rebases of
both.

## Acceptance criteria

- A fresh fork reaches a working worldwide map with **zero accounts created**
  (no Mapbox, no key of any kind on the default path).
- `grep -ri mapbox src scripts` finds only historical comments (or nothing).
- `pnpm build` contains no `mapbox-gl`; bundle diff reviewed (MapLibre is
  slightly smaller).
- Visual checklist at 3 zooms × both cities: basemap legible, route colors and
  MTB rating colors unchanged, closure dashes (#109) render, POI icons render,
  popups/markers styled correctly (`map.css` selectors renamed —
  `.mapboxgl-popup` → `.maplibregl-popup`).
- Elevation backfill diff within agreed tolerance; GPX export and ride
  recorder unaffected.
- Attribution correct: OpenStreetMap contributors + OpenFreeMap (basemap) +
  "Terrain tiles by Mapzen/AWS Open Data" where elevation is shown.

## Risks and open questions

- **The basemap will look different.** Liberty is not the Chattanooga brand
  style built in Studio. Budget a real styling pass; treat the checked-in
  style JSON as a design asset with its own review, and screenshot-diff both
  cities before/after.
- **Chattanooga trails aren't OSM-referenced yet.** If the ADR-0001 open
  question ("does Chattanooga generalise?") answers badly, we bridge by
  converting the existing tileset to GeoJSON/PMTiles rather than blocking
  de-Mapboxing on OSM matching.
- **OpenFreeMap longevity.** It's donation-run. Mitigations: the style is
  ours and schema-standard (OpenMapTiles), so the tile URL is one config line,
  and the PMTiles path is the documented fallback. This is a far better
  failure mode than a vendor deciding to charge.
- **DEM quality.** Terrarium's US coverage (NED-derived) is comparable at our
  zooms, but spot-check the two cities' known trails before trusting the
  backfill.
- **Offline/PWA caching** of basemap tiles changes origin; verify the service
  worker (if any caching rules name Mapbox hosts).

## Out of scope

- Any change to the OSM-referenced geometry model, Overpass usage, or the
  Payload admin (those are #100's territory and already vendor-neutral).
- Self-hosting Overpass or a geocoder (config hooks only).
- Map feature work of any kind — this plan is a lateral move with pixel-level
  differences confined to the basemap.
