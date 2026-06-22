# Bike Map — Next Steps

_Last updated: 2026-06-22_

## Context

The app started as a Chattanooga bike map and is becoming a **multi-city
platform**. City selection is wired (`NEXT_PUBLIC_CITY_ID` →
`src/config/map.config.ts` + `src/data/cities/<city>/`). Bend is the first new
city and the test of whether the pattern scales.

**Shipped (merged to `main` via PR #91):**
- Bend MTB trail pane — 169 curated trails matched to OSM ways by geometry and
  rendered from the shared nationwide OSM tileset by `OSM_ID`
  (`matchBy: 'osmId'`), with per-trail elevation profiles.
- Pipeline: `scripts/scrape_bend_bike_rides.py` → `align_bend_geometry.py` →
  `build_bend_trails.py`. Reference data in `data/`, match table in
  `data/bend-osm-match.csv`.
- Bend bike resources + map features (concurrent session).
- Nationwide OSM trails layer + precomputed elevation for OR and TN.
- onX validation tooling (`scripts/mtb_project_trail_validation.py`,
  `onx_trail_validation.py`).

**Assessment:** Bend's MTB pane is solid; Bend overall is ~70% feature-complete
vs Chattanooga. Biggest gaps below.

---

## Phase 1 — Close the loop (do first; small, unblocks trust)

- [x] **Browser smoke test for Bend — PASS (2026-06-22).** Verified on
  `NEXT_PUBLIC_CITY_ID=bend` (:3000): region→area pane grouping with difficulty
  icons + per-trail distance/gain; `TRAIL_SELECT` applies the OSM_ID highlight,
  fetches the right `<slug>.json`, renders the elevation pane + grade gradient;
  multi-segment trails highlight as one; base filter excludes the nationwide
  layer; zero console errors. (Curated render is independent of the Nationwide
  toggle.)
- [x] **~~Fix the lint-staged trap~~ — NOT A BUG (verified 2026-06-22).**
  Empirically tested: lint-staged preserves staged files that match no task glob
  (`data/*.csv`, `scripts/*.py`) even when tasks run on a sibling `.ts`. The
  `data/` drop traced to a concurrent session's `git commit --amend` staging a
  different set, **not** the hook. Real mitigation is process, not config:
  coordinate before amending shared commits, and `git ls-files` to confirm what
  actually landed after a collaborative commit.

## Phase 2 — Finish "Bend feature-complete" (the original goal)

- [x] **Curated bike routes for Bend — DONE (2026-06-22).** Two parts, both
  rebuilt from OSM (inspired by bendbikes.org):
  - **Classified bike-network overlay** — `scripts/build_bend_bike_network.py`
    → `public/data/bend/bike-network.geojson` (6,189 ways, 5 LTS-lite classes);
    `ensureBendNetworkSource`/`setBendNetworkVisible` render 2 stacked layers,
    toggled from the Casual sidebar (`BikeNetworkLayer` + legend), city-gated by
    `bikeNetworkUrl`.
  - **8 greenway routes** — `scripts/build_bend_routes.py` →
    `public/data/bend/routes.geojson` + `bend/bike-routes.data.ts`;
    `ensureInlineRoutes` attaches per-route line/casing/hit layers from GeoJSON
    (keyed by `id`) so the existing route select/zoom/click flow works unchanged.
    City-gated by `bikeRoutesUrl`. OSM/Bend Bikes credit on the About page.
- [ ] **Non-Chattanooga base style.** We currently *hide* Chattanooga route
  layers when Bend is active (`hiddenStyleLayerIds`). Bend needs its own Studio
  style or a neutral shared base.
- [ ] **MTB data polish** (the quality thread):
  - [ ] **Collision groups (12 trails / 4 groups)** — distinct trails sharing one
    OSM way (Radlands ×5, Alpine ×3, two Metolius-Windigo pairs). Now *consistent*
    via `OSM_ID_OWNER` but still identical geometry. Split by clipping the shared
    OSM way to each trail's bendbikerides path extent (more reliable than onX's
    single point).
  - [ ] **Scope decision** — keep all 169 or tighten to Bend-core (~110–130 ≤25
    mi). Far destination areas (Oakridge 61 mi, Waldo, Madras, Cascade Crest) hold
    the weakest matches + all collisions + the OSM tagging gaps.
  - [ ] **Difficulty reconciliation** — onX rates 14 trails one notch harder;
    decide whether to adopt, flag, or ignore (different editorial scales).
  - [ ] **Distance reconciliation** — compare our OSM-sampled distances vs
    bendbikerides' own numbers (same trail definition) to catch over/under
    assignment (e.g. Swamp Wells OSM 19.7 mi vs source 23.0 mi).
  - [ ] **OSM tagging gaps** — Sisters/Peterson Ridge singletrack lacks
    `bicycle`/`mtb:scale` so the bike filter excludes it. Either upstream OSM
    edits or a looser per-corridor re-fetch; otherwise accept the gap.

## Phase 3 — Strategic fork (decide the direction)

Pick one to invest in next:

- **Breadth — prove "any city."** Onboard a 3rd city from **OSM alone** (no
  curated scrape) and judge the nationwide-trails-only experience. This is the
  real scalability test and is cheap.
- **Depth — OSM as the universal default.** Make the nationwide OSM trails layer
  the default for every city (trails for free everywhere), with curated overlays
  only where we invest, backed by the onX/precompute tooling for quality.

---

## Tech debt / cleanup (parallel track)

- [ ] **`Map.tsx` decomposition** — extract the GPS/compass hook + add Map tests
  (the last open-source-cleanup item).
- [ ] **onX validation tool hardening** — review items in
  `onx_trail_validation.py` (empty-name Levenshtein → 1.0, unguarded
  `route['location']` sub-fields, meters-assumption on onX length). Owned by the
  validation-tool author; coordinate before editing.
- [ ] **Branch coordination** — multiple agents have been amending/pushing the
  same branch. Agree on ownership before force-pushing shared history.

## Recommendation

Do **Phase 1** now (verify + stop the commit-trap bleeding), then **Bend curated
routes** in Phase 2 (closes the original goal, most user-visible), and run
**Phase 3 breadth** as the proof-of-concept that decides curated-per-city vs
OSM-default-everywhere.
