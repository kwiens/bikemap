# Open Bike Map

An open-source trail and bike-route platform for any community. Browse curated road and greenway routes, hundreds of mountain bike trails with elevation profiles, real-time bike share availability, and record your own rides with GPS — all in a fast, mobile-first web app you can install to your home screen.

The Chattanooga, TN deployment is the reference implementation. The codebase is built so a new community can fork it, swap configuration and data, and ship.

<p align="center">
  <img src="public/screenshot-splash.png" alt="Open Bike Map main view" width="45%">
  <img src="public/screenshot-route.png" alt="Route selection view" width="45%">
</p>

## Make it yours

Open Bike Map is designed to be re-skinned for a new community in an afternoon, not a quarter. Every piece a community would want to control is intentionally pulled out of the code and into a small, well-marked set of files:

- **One config file for your geography.** `src/config/map.config.ts` holds the Mapbox style, default map view, GBFS feed, and region metadata. Point it at your area and the map opens there.
- **Plain TypeScript data, not a CMS.** Routes, mountain bike trails, attractions, bike shops, and local resources are typed arrays in `src/data/`. Add an entry, ship a PR — no database, no admin panel, no backend.
- **Style your routes in Mapbox Studio.** Curate route lines visually, then reference the layer IDs from `bike-routes.ts`. Trails come from a vector tileset you control.
- **Trail data is automated.** Drop your trail tileset in, run `scripts/add_trail_elevation.py`, and the script generates per-trail elevation profiles, distances, and bounding boxes from Mapbox Vector Tiles + Terrain-RGB. No manual GPX wrangling.
- **Bring-your-own bike share (or skip it).** If your city publishes a [GBFS](https://gbfs.org/) feed, change one URL. If it doesn't, hide the layer.
- **Brand it.** Replace logos in `public/`, swap the welcome copy in `WelcomeModal.tsx`, adjust the brand colors in `tailwind.config.ts` (`app-primary` / `app-secondary`).

A community fork is a fork-and-edit, not a rewrite. The Chattanooga build is just one set of inputs to a generic engine — see [Deploying for your community](#deploying-for-your-community) below for the step-by-step.

## Features

### For riders

- **Curated bike routes** — Hand-picked road, greenway, and connector routes styled in Mapbox Studio with descriptions, distance, and zoom-to-fit bounds.
- **Mountain bike trails** — 225+ trails in the Chattanooga deployment, grouped by recreation area and region, color-coded by difficulty, with per-trail elevation profiles (gain/loss/min/max and a sampled distance-vs-elevation chart).
- **Real-time bike share** — Live station availability via the [GBFS](https://gbfs.org/) standard, configurable per region.
- **Points of interest** — Attractions, bike shops, rentals, and local resources as toggleable map layers.
- **Live location & compass** — Tracks position and heading, with a smoothed compass heading derived from GPS readings.
- **Welcome onboarding** — Asks new users whether they ride Casual (greenways/loops) or Mountain (singletrack) and tailors the default view.
- **Installable PWA** — Manifest, service worker, custom splash screens, and an in-app install prompt for iOS and Android home-screen install.
- **Mobile-first UI** — Collapsible sidebar, touch-friendly controls, and resize handling that reflows the map when the sidebar opens or closes.

### Ride recording

A full GPS ride tracker, all client-side:

- Start, pause, resume, and stop with live distance, elapsed time, and elevation gain.
- Wake-lock support keeps the screen on during a ride.
- Accuracy gating (`MAX_ACCURACY_M`) discards bad GPS fixes before they pollute stats.
- Elevation smoothing via EMA + dead-band + spike filtering, then optional DEM correction against Mapbox Terrain-RGB tiles for clean elevation profiles.
- **Crash recovery** — Rides are checkpointed to IndexedDB so a browser crash, accidental tab close, or backgrounded mobile app can be recovered on next load.
- **Background-gap detection** — If GPS goes silent for too long (mobile backgrounding), recording pauses gracefully.
- Rides are saved locally to IndexedDB. Browse history, view per-ride detail with the route drawn on the map and elevation chart, and export as **GPX**.

### For curators / community maintainers

- **Configurable map** — `src/config/map.config.ts` centralizes the Mapbox token, style URL, default view (center/zoom/pitch/bearing), GBFS endpoints, and region metadata. Forking for a new community starts here.
- **Trail tooling (Python)** — Scripts to extract trail geometry from a Mapbox vector tileset and sample elevation from Terrain-RGB, producing per-trail JSON profiles and updating the trail manifest with distance, gain/loss, and bounds:
  - `scripts/add_trail_bounds.py` — Recompute bounding boxes and lengths from raw layer coordinates.
  - `scripts/add_trail_elevation.py` — Generate `public/data/elevation/{slug}.json` and update `src/data/mountain-bike-trails.ts`.
  - `scripts/validate_trails.py` — Sanity-check the trail manifest.
- **Bidirectional events** — Components communicate via custom DOM events (`route-select`, `layer-toggle`, `center-location`, `route-deselect`, `sidebar-toggle`), so clicking a route on the map syncs the sidebar and vice versa. See `src/events.ts`.
- **GPX import/export** — Round-trip rides and routes via the standard GPX 1.1 format.

## Architecture

Built on Next.js App Router with Mapbox GL JS for rendering. The map canvas is dynamically imported with SSR disabled because Mapbox is browser-only.

```
src/
├── app/                   Next.js App Router pages (map, about, export, test)
├── components/
│   ├── Map.tsx            Main map orchestrator (init, markers, custom events)
│   ├── MapLegend.tsx      Sidebar container & state
│   ├── MapMarkers.tsx     Marker factories and MarkerManager
│   ├── RidesPanel.tsx     Ride recording controls and history
│   ├── WelcomeModal.tsx   First-run onboarding & ride-style preference
│   ├── PwaInstallPrompt   Install-to-home-screen prompt
│   └── sidebar/           BikeRoutes, MountainBikeTrails, MapLayers,
│                          AttractionsList, BikeRentalList, BikeResourcesList,
│                          ElevationProfile, RideHistory, RideDetail, ...
├── config/map.config.ts   Geo-specific configuration (Mapbox, GBFS, region)
├── data/
│   ├── bike-routes.ts             Curated road/greenway routes
│   ├── mountain-bike-trails.ts    Trail manifest (225+ in Chattanooga)
│   ├── bike-resources.ts          Shops & repair stations
│   ├── local-resources.ts         Community resources
│   ├── map-features.ts            Attractions / POIs
│   ├── gbfs.ts                    Live bike share API integration
│   └── ride.ts                    Recorded-ride types & helpers
├── hooks/                 useRideRecording, useLocationTracking, useWakeLock,
│                          useMapResize, useToast, use-mobile
├── utils/                 ride-stats, ride-storage (IndexedDB), dem (Terrain-RGB
│                          elevation correction), gpx, gpx-parser, compass,
│                          format, settings, map (geocoding & bounds), svg
├── events.ts              Custom DOM event constants
└── lib/utils.ts           cn() — clsx + tailwind-merge

public/data/elevation/     Per-trail elevation JSON
public/terrain/            Local terrain assets
scripts/                   Python tooling for trails & elevation
```

### Configuration model

Everything geography-specific lives in `src/config/map.config.ts`. The Chattanooga config is the reference; a new community ships by:

1. Replacing the Mapbox style URL and access token (or sourcing them from env).
2. Updating `defaultView` (center/zoom/pitch/bearing) for the area you want to land on.
3. Pointing `gbfs.baseUrl` at your local GBFS feed (or removing the bike-share layer if there is none).
4. Replacing the data files in `src/data/` with your routes, trails, shops, and POIs.
5. Re-running `scripts/add_trail_elevation.py` to generate elevation profiles for your trails.

The trail layer in Mapbox Studio is identified by source-layer name; when GIS data is re-uploaded, update `MTN_BIKE_SOURCE_LAYER` in `src/data/mountain-bike-trails.ts` and `MVT_TILESET` in `scripts/add_trail_elevation.py`. See `CLAUDE.md` for Chrome DevTools snippets to discover current names.

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Map**: Mapbox GL JS 3
- **Styling**: Tailwind CSS, shadcn/ui primitives, Radix UI
- **Icons**: Font Awesome, lucide-react
- **Storage**: IndexedDB (rides, in-progress checkpoints) and cookies (settings)
- **PWA**: Service worker + Web App Manifest
- **Tooling**: TypeScript, Vitest, Biome + ESLint, pnpm
- **Trail data pipeline**: Python (Mapbox vector tiles + Terrain-RGB)

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10+ (recommended) or npm

### Install and run

```bash
git clone https://github.com/kwiens/bikemap.git
cd bikemap
pnpm install
cp .env.example .env.local         # add your Mapbox token if needed
pnpm dev                           # http://localhost:3000
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm test` | Vitest in watch mode |
| `pnpm test:run` | Vitest single run |
| `pnpm lint` | ESLint + Biome lint + Biome format checks |
| `pnpm lint:fix` | Auto-fix lint and formatting |

### Trail elevation pipeline (Python)

Required only if you are curating new trail data.

```bash
# Generate elevation for one trail
python scripts/add_trail_elevation.py --trail "Stringer's Ridge"

# Generate for every trail in the manifest
python scripts/add_trail_elevation.py
```

Outputs `public/data/elevation/{slug}.json` and updates summary stats in `src/data/mountain-bike-trails.ts`. See `CLAUDE.md` for guidance on adding a new trail end-to-end.

## Testing

Tests live next to source as `*.test.ts(x)` and run under Vitest with jsdom. Coverage spans:

- GBFS API integration (fetching and shaping bike-share data)
- Geocoding, route opacity, bounds utilities
- Ride statistics (distance, moving time, elevation gain with smoothing)
- Ride storage (IndexedDB via `fake-indexeddb`)
- DEM elevation correction
- GPX building and parsing
- Compass heading smoothing
- Sidebar components (BikeRoutes, MountainBikeTrails, ElevationProfile, RidesPanel, WelcomeModal)

Mapbox layer events cannot be triggered synthetically — for layer-click testing, dispatch the corresponding custom event from `src/events.ts` directly.

## Deploying for your community

The fastest path:

1. Fork the repo.
2. Edit `src/config/map.config.ts` for your region.
3. Replace data in `src/data/` (routes, trails, shops, POIs).
4. Style your routes and trails in Mapbox Studio; update layer IDs in the data files.
5. Run the trail elevation script if you have mountain bike trails.
6. Deploy on any Node host. Vercel works out of the box.

## Future work

### Native app wrapper for the App Store and Google Play

Open Bike Map is already a Progressive Web App — it installs to the home screen, runs offline-friendly via a service worker, requests GPS / wake-lock / motion permissions, and ships custom splash screens. PWA install covers the technical case well, but it doesn't match how most riders look for a bike app: they search the App Store or Google Play.

The plan is to ship a thin native wrapper around the existing web app — most likely [Capacitor](https://capacitorjs.com/) — so the same codebase ships to:

- **iOS App Store** (Capacitor → native iOS shell)
- **Google Play** (Capacitor → native Android shell)
- **Web** (the current PWA, unchanged)

What the wrapper buys us beyond the PWA:

- **Discoverability** in the platform stores so a community deployment shows up for "Chattanooga bike map" searches.
- **Better background GPS** for long rides, where mobile browsers throttle or suspend `geolocation` watchers.
- **More reliable wake lock** and screen-on behavior across devices.
- **Native share sheets** for exporting GPX rides into Strava, Komoot, etc.
- **Push notifications** down the road — trail-condition alerts, new-route announcements per community.
- **Apple Maps / Google Maps deep links** for "navigate to this trailhead."

The architectural bet here is that the web app stays the source of truth and the wrapper is mechanical. Each community deployment can then choose: PWA-only (free, instant) or store-listed (one-time native build pipeline per community brand).

### Other things on the roadmap

- **Multi-community switcher** — host several cities from one deployment by selecting `mapConfig` per route or subdomain.
- **Trail conditions / closures** — community-curated overlay so locals can flag a trail as wet, closed, or rerouted.
- **Cloud ride sync (opt-in)** — rides are local-only today; an optional account would let riders see history across devices.
- **Heatmaps from recorded rides** — anonymized aggregate to surface which informal connectors riders actually use.

## Contributing

Pull requests welcome. For larger changes — new capabilities, a new community deployment, or pipeline changes — open an issue first so we can talk through the shape.

1. Fork and create a feature branch.
2. Make your change with tests where it makes sense.
3. `pnpm test:run && pnpm lint`.
4. Open a PR.

## Dedication

This project is dedicated to the memory of our friend and collaborator Yoseph. In his honor, consider donating to [Yoseph's Bikes](https://www.whiteoakbicycle.org/yoyobikes) to help children access the joy of riding.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- The Chattanooga cycling community for route curation, trail data, and feedback
- [Bike Chattanooga](https://bikechatt.com) for bike-share infrastructure
- [SORBA Chattanooga](https://www.sorbachatt.org/) and the trail builders behind the regional MTB network
- [iFixit](https://www.ifixit.com) for supporting open-source community projects

---

Made with ❤️ in Chattanooga, TN — and ready for your community next.
