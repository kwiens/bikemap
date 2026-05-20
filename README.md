# Open Bike Map

<p align="center">
  <a href="https://bikechatt.com">
    <img src="https://img.shields.io/badge/%E2%96%B6%20Live%20Demo-bikechatt.com-2563EB?style=for-the-badge&labelColor=111827" alt="Live Demo: bikechatt.com" height="48">
  </a>
</p>

<p align="center">
  <a href="https://github.com/kwiens/bikemap/actions/workflows/test.yml">
    <img src="https://github.com/kwiens/bikemap/actions/workflows/test.yml/badge.svg" alt="Tests">
  </a>
</p>

An open-source trail and bike-route platform for any community. Browse curated road and greenway routes, hundreds of mountain bike trails with elevation profiles, real-time bike share availability, and record your own rides with GPS — all in a fast, mobile-first web app you can install to your home screen.

The included reference deployment is configured for [Chattanooga, TN](https://bikechatt.com), but the codebase is built so a new community can fork it, swap configuration and data, and ship.

<p align="center">
  <img src="public/screenshot-splash.png" alt="Open Bike Map main view" width="45%">
  <img src="public/screenshot-route.png" alt="Route selection view" width="45%">
</p>

## Make it yours

Open Bike Map is a fork-and-edit, not a rewrite. Everything a community controls is pulled out of the code into a small set of well-marked files:

- **`src/config/site.config.ts`** — branding (name, description, colors, PWA identity).
- **`src/config/map.config.ts`** — geography (Mapbox style, default view, GBFS feed, region).
- **`src/data/*`** — routes, trails, shops, and points of interest as plain typed arrays. No database, no CMS.
- **`public/*`** — logos, icons, splash screens.

The full step-by-step is in **[docs/DEPLOYING.md](docs/DEPLOYING.md)**; the data-file contract is in **[docs/DATA.md](docs/DATA.md)**.

## Features

### For riders

- **Curated bike routes** — Hand-picked road, greenway, and connector routes styled in Mapbox Studio with descriptions, distance, and zoom-to-fit bounds.
- **Mountain bike trails** — 225+ trails in the reference deployment, grouped by recreation area and region, color-coded by difficulty, with per-trail elevation profiles.
- **Real-time bike share** — Live station availability via the [GBFS](https://gbfs.org/) standard, configurable per region.
- **Points of interest** — Attractions, bike shops, rentals, and local resources as toggleable map layers.
- **Live location & compass** — Tracks position and heading, with a smoothed compass heading derived from GPS readings.
- **Installable PWA** — Manifest, service worker, custom splash screens, and an in-app install prompt for iOS and Android.
- **Mobile-first UI** — Collapsible sidebar, touch-friendly controls, and resize handling that reflows the map.

### Ride recording

A full client-side GPS ride tracker:

- Start, pause, resume, stop with live distance, elapsed time, and elevation gain.
- Wake-lock keeps the screen on; accuracy gating discards bad GPS fixes.
- Elevation smoothing (EMA + dead-band + spike filtering) with optional DEM correction against Mapbox Terrain-RGB.
- **Crash recovery** — rides are checkpointed to IndexedDB and recoverable after a crash or tab close.
- **Background-gap detection** — recording pauses gracefully when GPS goes silent.
- Rides save locally to IndexedDB; browse history, view per-ride detail, and export as **GPX**.

### For curators / community maintainers

- **Two config files** drive geography and branding; content is plain TypeScript in `src/data/` — see [docs/DATA.md](docs/DATA.md).
- **Trail tooling** — Python scripts extract trail geometry from a Mapbox tileset and sample elevation from Terrain-RGB to generate per-trail profiles. See [docs/DEPLOYING.md](docs/DEPLOYING.md).
- **GPX import/export** — round-trip rides and routes via the standard GPX 1.1 format.

## Architecture

Built on Next.js App Router with Mapbox GL JS for rendering. The map canvas is dynamically imported with SSR disabled because Mapbox is browser-only.

```
src/
├── app/                   Next.js App Router pages
├── components/
│   ├── Map.tsx            Main map orchestrator (init, markers, custom events)
│   ├── MapLegend.tsx      Sidebar container & state
│   ├── MapMarkers.tsx     Marker factories and MarkerManager
│   ├── RidesPanel.tsx     Ride recording controls and history
│   ├── WelcomeModal.tsx   First-run onboarding & ride-style preference
│   └── sidebar/           BikeRoutes, MountainBikeTrails, MapLayers,
│                          ElevationProfile, RideHistory, RideDetail, ...
├── config/
│   ├── site.config.ts     Branding / app identity
│   └── map.config.ts      Geo-specific configuration (Mapbox, GBFS, region)
├── data/                  Routes, trails, shops, POIs — see docs/DATA.md
├── hooks/                 useRideRecording, useWakeLock, useMapResize,
│                          useToast, use-mobile
├── utils/                 ride-stats, ride-storage (IndexedDB), dem (Terrain-RGB
│                          elevation correction), gpx, compass, map, format
├── events.ts              Custom DOM event constants
└── lib/utils.ts           cn() — clsx + tailwind-merge

public/data/elevation/     Per-trail elevation JSON
scripts/                   Python tooling for trails & elevation
```

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Map**: Mapbox GL JS 3
- **Styling**: Tailwind CSS, shadcn/ui primitives, Radix UI
- **Icons**: Font Awesome, lucide-react
- **Storage**: IndexedDB (rides) and cookies (settings)
- **PWA**: Service worker + Web App Manifest
- **Tooling**: TypeScript, Vitest, Biome + ESLint, pnpm
- **Trail data pipeline**: Python (Mapbox vector tiles + Terrain-RGB)

## Getting started

**Prerequisites:** Node.js 20+ and pnpm 10+.

```bash
git clone https://github.com/kwiens/bikemap.git
cd bikemap
pnpm install
cp .env.example .env.local         # add your Mapbox token — see .env.example
pnpm dev                           # http://localhost:3000
```

A free [Mapbox](https://account.mapbox.com/access-tokens/) public token is required for the map to render.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm test` / `pnpm test:run` | Vitest (watch / single run) |
| `pnpm lint` / `pnpm lint:fix` | Lint + format (check / auto-fix) |

The Python trail-elevation pipeline is optional and documented in [docs/DEPLOYING.md](docs/DEPLOYING.md).

## Testing

Tests live next to source as `*.test.ts(x)` and run under Vitest with jsdom — covering GBFS integration, ride stats and storage, DEM correction, GPX build/parse, compass smoothing, and sidebar components.

Mapbox layer events cannot be triggered synthetically — for layer-click testing, dispatch the corresponding custom event from `src/events.ts` directly.

## Deploying for your community

Fork the repo and follow **[docs/DEPLOYING.md](docs/DEPLOYING.md)** — it walks through Mapbox setup, the two config files, the `src/data/` content ([docs/DATA.md](docs/DATA.md)), brand assets, and deploying to Vercel or any Node host.

## Contributing

Pull requests welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for dev setup and conventions, and the [Code of Conduct](CODE_OF_CONDUCT.md). For larger changes (new capabilities, a new community deployment, pipeline changes), open an issue first.

## Future work

### Native app wrapper for the App Store and Google Play

Open Bike Map is already a Progressive Web App — it installs to the home screen, runs offline-friendly via a service worker, and ships custom splash screens. But that doesn't match how most riders look for a bike app: they search the App Store or Google Play.

The plan is a thin native wrapper around the existing web app — most likely [Capacitor](https://capacitorjs.com/) — shipping the same codebase to the iOS App Store and Google Play alongside the web PWA. Beyond discoverability, it buys better background GPS for long rides, more reliable wake lock, native share sheets for GPX export, and a path to push notifications. The web app stays the source of truth; the wrapper is mechanical.

### Other things on the roadmap

- **Multi-community switcher** — host several cities from one deployment by selecting `mapConfig` per route or subdomain.
- **Trail conditions / closures** — community-curated overlay so locals can flag a trail as wet, closed, or rerouted.
- **Cloud ride sync (opt-in)** — rides are local-only today; an optional account would sync history across devices.
- **Heatmaps from recorded rides** — anonymized aggregate to surface which informal connectors riders actually use.

## Dedication

This project is dedicated to the memory of our friend and collaborator Yoseph. In his honor, consider donating to [Yoseph's Bikes](https://www.whiteoakbicycle.org/yoyobikes) to help children access the joy of riding.

## License

GNU GPL v3 — see [LICENSE](LICENSE).

## Acknowledgments

- The Chattanooga cycling community for route curation, trail data, and feedback
- [Bike Chattanooga](https://bikechatt.com) for bike-share infrastructure
- [SORBA Chattanooga](https://www.sorbachatt.org/) and the trail builders behind the regional MTB network
- [iFixit](https://www.ifixit.com) for supporting open-source community projects

---

Built for community trail networks, everywhere.
