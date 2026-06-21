# Data files

All content shown on the map lives in `src/data/` as plain, typed TypeScript
arrays — no database, no CMS, no admin panel. To change what a deployment
shows, edit an array and ship a PR.

Each file exports a typed array; the `interface` at the top of the file is the
contract. `icon` fields are Font Awesome `IconDefinition` values imported from
`@fortawesome/free-solid-svg-icons` — use an existing icon, don't add a new
library.

| File | Export | What it is |
|---|---|---|
| `bike-routes.ts` | `bikeRoutes: BikeRoute[]` | Curated road / greenway routes |
| `mountain-bike-trails.data.ts` | `mountainBikeTrails: MountainBikeTrail[]` | MTB trail manifest — the array you edit |
| `mountain-bike-trails.ts` | types, `REGION_MAP`, `regionFor` | Trail types & region logic; re-exports the array |
| `bike-resources.ts` | `bikeResources: BikeResource[]` | Bike shops & repair stations |
| `map-features.ts` | `mapFeatures: MapFeature[]` | Attractions / points of interest |
| `local-resources.ts` | `localResources: LocalResource[]` | Community resource links |
| `gbfs.ts` | — | Live bike-share API client (no static data) |

`geo_data.ts` is a barrel that re-exports the above; import from `@/data/geo_data`.
The MTB trail array lives in its own `mountain-bike-trails.data.ts` so the
3,000-line literal doesn't bury the types and region logic.

## BikeRoute (`bike-routes.ts`)

Routes are line layers styled in Mapbox Studio; the entry here wires a layer to
its sidebar card.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | **Must equal the Mapbox Studio layer ID** for this route |
| `name` | `string` | Display name |
| `color` | `string` | Hex; should match the layer's color in Studio |
| `description` | `string` | Sidebar copy |
| `icon` | `IconDefinition` | Font Awesome icon |
| `defaultWidth` | `number` | Line width in px |
| `opacity` | `number` | 0–1 |
| `distance` | `number` | Miles |
| `defaultBounds?` | `[swLng, swLat, neLng, neLat]` | Zoom-to-fit fallback when runtime bounds aren't available |
| `bounds?` | `mapboxgl.LngLatBounds` | Computed at runtime — do not hand-author |

## MountainBikeTrail (`mountain-bike-trails.data.ts`)

| Field | Type | Notes |
|---|---|---|
| `trailName` | `string` | **Must equal the `Trail` feature property** in the trail tileset |
| `displayName` | `string` | Human-friendly name |
| `recArea` | `string` | Recreation-area grouping; map it to a region in `REGION_MAP` (in `mountain-bike-trails.ts`) |
| `rating` | `string` | `easy` \| `intermediate` \| `advanced` \| `expert` \| `''` — drives the color |
| `color` | `string` | Use the `trailColor(rating, isGreenway)` helper at the top of this data file |
| `icon` | `IconDefinition` | Font Awesome icon |
| `distance?` | `number` | Miles — **script-generated** |
| `elevationGain/Loss/Min/Max?` | `number` | Feet — **script-generated** |
| `defaultBounds?` | `[swLng, swLat, neLng, neLat]` | **script-generated** |
| `bounds?` | `mapboxgl.LngLatBounds` | Runtime only |

`REGION_MAP` (in `mountain-bike-trails.ts`) maps each `recArea` to a geographic
region for the sidebar grouping — add an entry when you introduce a new
`recArea`.

## BikeResource (`bike-resources.ts`) & MapFeature (`map-features.ts`)

Point markers. `BikeResource` is `name`, `description`, `address`, `latitude`,
`longitude`. `MapFeature` is the same plus an `icon`.

## LocalResource (`local-resources.ts`)

| Field | Type | Notes |
|---|---|---|
| `name`, `description`, `url` | `string` | Resource card; `url` may be a path (`/about`) or external |
| `icon` | `IconDefinition` | Font Awesome icon |
| `colorTheme` | `'blue' \| 'green' \| 'purple' \| 'gray'` | Card accent |
| `secondaryDescription?` / `secondaryUrl?` / `secondaryLinkText?` | `string` | Optional second link |

## Script-generated fields

The Python scripts in `scripts/` own these fields — hand-authoring them is
pointless, they get overwritten. See [DEPLOYING.md](DEPLOYING.md) for setup.

| Script | Writes |
|---|---|
| `add_trail_elevation.py` | `MountainBikeTrail` elevation stats (`elevationGain/Loss/Min/Max`, `distance`) + per-trail `public/data/elevation/{slug}.json` |
| `add_trail_bounds.py` | `MountainBikeTrail.defaultBounds` and `distance` |
| `validate_trails.py` | Read-only — flags geometry/elevation anomalies |

### Per-trail elevation JSON (`public/data/elevation/{slug}.json`)

Written by `add_trail_elevation.py`, consumed by the elevation chart:

```ts
interface ElevationProfile {
  trail: string;
  distance: number;        // total distance, feet
  gain: number;            // feet
  loss: number;            // feet
  min: number;             // feet
  max: number;             // feet
  profile: [number, number, number, number][]; // [distance_ft, elevation_ft, lng, lat]
}
```
