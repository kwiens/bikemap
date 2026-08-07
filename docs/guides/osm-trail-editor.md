# OSM trail editor

An online flow for curating trails: pick the OpenStreetMap ways a trail rides
on, press save, and the geometry, distance, elevation, and bounds are rebuilt
from OSM server-side. No Python, no local tooling, no drawing.

See [ADR-0001](../adr/0001-admin-ui-and-content-backend.md) for how this was
chosen.

**The public map now reads trails from Payload.** It still falls back to the
checked-in data in `src/data/` when there is no database, so the app runs fine
without one — see [Reading trails on the public map](#reading-trails-on-the-public-map).

## The idea

**A trail does not own its geometry — it references it.**

```ts
{ displayName: 'Cole Loop', recArea: 'Bend Area', rating: 'intermediate',
  osmIds: [438938540, 438942588, 692052468] }
```

Everything else is derived. That's the whole design, and it follows what
`scripts/build_bend_trails.py` already established for Bend: geometry comes from
OSM, we curate the names, ratings, and groupings on top.

What it buys:

| | Owning the geometry | Referencing OSM |
|---|---|---|
| Add a trail | draw the whole line | click the ways |
| Trail gets rerouted | redraw it | tick "rebuild" and save |
| Fix a wrong line | edit your copy | fix it in OSM — everyone benefits |
| Storage | a source of truth to protect | a cache you can rebuild |

## Running it

```bash
docker compose up -d      # Postgres on :5432
pnpm db:migrate           # create the schema
pnpm db:seed:bend         # import Bend's 182 trails
pnpm dev                  # /admin — first visit creates the admin user
```

Needs `DATABASE_URL`, `PAYLOAD_SECRET`, and `NEXT_PUBLIC_MAPBOX_TOKEN` in
`.env.local` (see `.env.example`). The Mapbox token is what samples elevation;
without it a trail still gets geometry and distance, just no climb figures.

## How a save works

`resolveTrailGeometry` (`src/payload/hooks/resolveTrailGeometry.ts`) runs
`beforeChange` on every trail, and takes one of two paths depending on
`geometrySource`:

```
osm     osmIds ──> fetchWaysByIds ──> assembleWays ──┐
                   (Overpass)         (join + gaps)  │
                                                     ├─> measureParts ──> stored fields
edited  the line as drawn in the geometry editor ────┘   (Terrain-RGB)    geom, distance,
                                                                          elevation*, bounds,
                                                                          osmReport
```

| Module | Job |
|---|---|
| `osm/overpass.ts` | Fetch full-resolution ways by id, with retry/backoff |
| `osm/assemble.ts` | Join ways end to end; report gaps rather than hide them |
| `osm/geometry.ts` | Parse/validate the stored line; the editor's vertex operations |
| `osm/terrain.ts` | Sample Mapbox Terrain-RGB (via `sharp`, since Node has no canvas) |
| `osm/measure.ts` | Distance, bounds, and elevation — shared by both paths |
| `osm/build.ts` | Orchestrate the OSM path into one `BuiltTrail` |

Both paths are **server-authoritative**: the admin suggests way ids or a line,
but every stored number is computed here, not accepted from the browser. An
edited trail and an OSM-built one are measured by the same `measureParts`, so
their distances are comparable.

Neither path does any work when nothing changed — Overpass is only called when
the ways change, and the DEM is only sampled when the line moves (or when
**Rebuild geometry** is ticked). An unrelated edit — fixing a typo in the name —
re-saves in ~30 ms instead of ~8 s.

### Collection hooks run *before* field validation

Payload runs a collection's `beforeChange` hooks ahead of field-level
`validate`, so the `validate` on `geom` never sees a bad value on the server —
only whatever the hook returned. That's why the hook parses the geometry itself
and throws a `ValidationError` rather than trusting the field. The field's
`validate` still earns its place: it runs in the browser, so the admin catches a
malformed line before a save is even attempted.

### Why Overpass and not the vector tiles

The map already renders OSM trails from a vector tileset, and the picker uses it
for instant feedback. But tile geometry is simplified and clipped at tile
boundaries, so what gets *stored* comes from Overpass. This is the same choice
`scripts/osm_trail_elevation.py` documents.

## What the editor sees

- **Trail geometry** — one map with three modes (below). The whole authoring
  surface.
- **Derived from OSM** — read-only build report, distance, elevation, bounds.
  Hand edits would be overwritten on the next save.
- **Rebuild geometry** — force a refresh when a trail changed upstream.

The build report is the important one, because referencing OSM has real failure
modes and they are silent unless surfaced:

| What happened | What you get |
|---|---|
| A way was deleted or renumbered upstream | listed as missing; the trail still builds from the rest |
| The picked ways don't connect | kept as separate parts, with the gap measured |
| Overpass was busy | previous geometry kept, save still succeeds — save again to retry |

## The map

`TrailMapEditor` (`src/payload/components/TrailMapEditor.tsx`) is the **Trail
geometry** field, and it is the only map in the editor. Three modes over the
same view:

| Mode | What it does |
|---|---|
| **Pick ways** | Click an OSM trail to add it, click again to remove. The default. |
| **Move points** | Click the line to select it, then drag a point, drag a midpoint to insert one, or **right-click** a point to remove it. `Delete` removes the whole selected piece. |
| **Draw** | Click along the trail to extend it; Enter finishes a piece, Escape cancels. How a trail that isn't in OSM gets geometry. |

One map rather than one per field, because picking a way and adjusting the
result are the same task at two different distances — two maps meant losing your
place on every switch.

- Both editing modes **snap** to nearby points and lines, which is what closing
  a gap between two pieces actually needs.
- **Undo / Redo** come from Terra Draw's own history, and `Ctrl`/`Cmd`+`Z` and
  `Ctrl`/`Cmd`+`Shift`+`Z` work too. They cover moving, inserting, and deleting
  points; they do not cover picking ways. Undo *also* restores a piece removed
  with `Delete`, which Terra Draw cannot do on its own — see below.
- **Removing a stray piece** is what `Delete` is for. A trail assembled from OSM
  ways sometimes picks up a section that belongs to a neighbouring trail; select
  that piece and press `Delete`. Removing the offending way in **Pick ways** and
  saving is the better fix where it applies, because the line then stays
  maintained upstream.
- **Satellite** toggles the basemap, which is what you want when checking a line
  against the singletrack visible on the ground.
- Distance updates **live** while you drag, using the same `lengthMeters` the
  server uses. Elevation does **not**: it needs the DEM sampled at 20 m spacing,
  which is a server job. Every number is recomputed authoritatively on save, so
  the live figure is a preview and the stored one is the truth.

### Terra Draw owns the line; we own the ways

Vertex dragging, midpoint insertion, deletion, snapping, and undo/redo come from
[Terra Draw](https://terradraw.io) (`terra-draw` +
`terra-draw-mapbox-gl-adapter`). An earlier version hand-rolled all of it and got
the details wrong in ways that only show up under a real pointer — 5 px hit
targets, handles gated behind a zoom the editor never reached.

`@mapbox/mapbox-gl-draw` was the other candidate and is ruled out: its
`direct_select` mode does not edit `Multi*` geometries, and `geom` is a
MultiLineString.

Terra Draw edits `LineString`s, so parts map to one feature each —
`partsToFeatures` / `featuresToParts` in `osm/geometry.ts`, 1:1 and
order-preserving, because part order is what the assembler and the gap report are
expressed in.

**Pick mode stays custom.** OSM ways are vector-tile features from a remote
tileset, not features in Terra Draw's store, so there is nothing for it to edit.
That mode is a plain Mapbox click handler on a transparent hit layer, and the
hit layer is hidden while editing so a click meant for a point isn't eaten by a
way underneath it.

Terra Draw's `change` event fires for its own edits *and* for our writes into its
store, and carries nothing to tell them apart — hence the `loadingRef` guard. Without it,
loading the stored line looks like an edit: the trail flips to "Edited by hand"
and the form goes dirty the moment it opens.

#### Features need `properties.mode`, and failures are silent

Terra Draw rejects a feature whose `properties.mode` it doesn't recognise, and
`addFeatures` **returns** the rejection rather than throwing it:

```
[{ "valid": false, "reason": "Mode property does not exist" }]
```

Miss it and the line never enters the store — nothing renders, nothing is
grabbable, in any mode, with nothing in the console. `partsToFeatures` therefore
takes the mode as a required argument, and `loadDraw` checks the returned
validations.

#### Undo/redo is opt-in, and silently absent otherwise

Terra Draw takes an `undoRedo` option, and **without it `undo()` and `redo()`
exist and do nothing** — the base mode's implementations are empty functions, so
the toolbar buttons no-op with no error. Both levels are wired, and they cover
different things:

| Level | Undoes |
|---|---|
| `sessionLevel` | Completed actions — a point moved, inserted, or deleted. This is what "undo my drag" means. |
| `modeLevel` | Steps inside an unfinished action — taking back the last point while still drawing. |

The coordinator prefers the mode stack while drawing and the session stack
otherwise, so Undo means the obvious thing in either mode. Button state comes
from the `history` event rather than being assumed, so Undo isn't offered when
the stack is empty.

Loading a line calls `clearUndoRedoHistory()`: whatever was just loaded is the
new baseline, and undoing past it would be undoing someone else's save.

#### The two deletions are one keystroke and an entire section apart

Terra Draw splits deletion across two gestures that are easy to confuse, and the
editor's hint text has to name them separately because the consequences are not
comparable:

| Gesture | Removes | Undoable by Terra Draw |
|---|---|---|
| **Right-click** a point | that one point | yes |
| **`Delete`** | the whole selected piece | **no** |

Two traps here, both of which this editor fell into:

1. **Left-clicking a point and pressing `Delete` does not remove the point.** It
   removes the entire piece — the click is irrelevant, `Delete` acts on the
   selected *feature*. The hint used to describe exactly this as the way to
   remove a point, so following the on-screen instructions destroyed a section
   of trail. Deleting a single coordinate is `onRightClick` in Terra Draw's
   select mode, gated on the `coordinates.deletable` flag; the base adapter
   registers a `contextmenu` listener and `preventDefault`s it, so the browser
   menu stays shut and right-click is safe to use here.
2. **Terra Draw cannot undo deleting a feature, and does not admit it.** After
   `Delete`, `canUndo()` returns true and `undo()` returns true — and the piece
   stays gone. Its history records coordinate edits, not the store's feature
   set. So `Delete` was the one keystroke in the editor with no way back: the
   Undo button lit up, did nothing, and reloading the page (losing every other
   edit) was the only recourse.

`src/payload/osm/deleted-pieces.ts` is the fix for the second. `readBack`
snapshots the line whenever the piece count *drops* — narrowly, because
snapshotting every change would mean copying the line on every frame of a drag —
and `undo()` tries Terra Draw first, then falls back to that stack when a
"successful" undo turns out to have moved nothing. `canUndo` on the toolbar is
the union of both stacks, so the button reflects what can really be restored.

`terra-draw-gestures.test.ts` pins all of this against the real library, so a
future version that changes any of it fails a test rather than quietly losing
trail geometry in the admin.

#### Points only appear on a *selected* feature

Select mode draws coordinate and midpoint handles for the selected feature only,
so entering **Move points** auto-selects the line when there is exactly one
piece. With several, which piece to edit is the editor's call and they click it.

#### Picking a way does not add it to the line

This is the trap the editor keeps setting. Pick a way, switch to **Move points**,
and there is nothing to grab on it — because the line is assembled from Overpass
**server-side on save**, and until then the way you picked is just a rendered
tileset feature. Nothing about it looks any different from a way that *is* part
of the line.

So the editor tracks which ways the line on screen was built from and says when
they diverge:

- ways changed, source `osm` → *save to rebuild the line, then edit it*
- ways changed, source `edited` → *saving will not rebuild it; discard the edits
  first if you want the new ways applied*
- no line at all → *pick some ways and save, or switch to Draw*

#### Committing on a `change` event is not the same as committing on an edit

Selecting a feature fires **three** `change` events, because Terra Draw keeps the
drag handles in the same store as the geometry. Committing on the event marked a
trail "Edited by hand" and dirtied the form the moment you clicked its line. So
`readBack` compares the line before and after, and writes only when it actually
moved.

#### `draw.start()` only ever runs from `style.load`

The Mapbox adapter's `register` calls `map.addSource` / `map.addLayer` with **no
style-loaded guard of its own** — no `isStyleLoaded` check, no `styledata`
listener. Starting it against a map that is still fetching its style throws
`Style is not done loading`, and because this is a Payload field component that
takes the entire trail form down with it, including fields that have nothing to
do with geometry.

The same applies after a basemap switch: `setStyle` discards every source and
layer, the adapter's included, and it does not put them back. So `mountDraw` is
the single place `start()` is called, it runs from `style.load`, and it stops
first if it was already started. The line survives a switch to satellite because
it is re-added from `partsRef`; the undo history does not, which is a fair trade
for not maintaining a fork of the adapter.

If it fails anyway, the field says so and goes read-only rather than crashing the
page.

### Two rules this component lives by

Both were bugs, and both are invisible until you put a real pointer on it:

1. **Every callback the map's handlers touch must be referentially stable.** The
   init effect calls `map.remove()` on cleanup, so a dependency that changes —
   a form value, a `setValue` — tears the map down mid-interaction. Read those
   from refs.
2. **Nothing may call `setState` at mousemove rate.** A custom field lives inside
   Payload's document form, so one `setState` per frame re-renders the whole
   form while you drag. The live distance readout is written straight to a DOM
   node.

### Editing takes the trail out of OSM's hands

**The first change flips `geometrySource` to `edited`**, and from then on the
hook stops rebuilding that trail from Overpass. It has to: otherwise the next
save would refetch the ways and silently discard the edit. The way ids stay on
the record, so **Discard edits and rebuild from OSM** can put it back.

Gaps are still reported for an edited line, the same as for a picked one —
dragging an endpoint away from its neighbour opens a break just as surely as
picking the wrong way does.

## Accuracy

Bend's Cole Loop rebuilt from its three way ids, against the Python pipeline:

| | Python | This |
|---|---|---|
| min elevation (ft) | 2917 | 2917 |
| max elevation (ft) | 4079 | 4083 |
| distance (mi) | 10.42 | 11.66 |

Elevation matching confirms the DEM sampling and unit conversion. The distance
gap is **a difference in definition, not a bug**: `build_bend_trails.py` traces a
reference polyline and uses only the portion of each way a trail covers, while
this uses whole ways — an online editor has no reference polyline, because the
editor *is* the reference.

Across 9 sampled Bend trails 7 matched within 0%, because OSM splits ways at
junctions. Cole Loop (+12%) and Tumalo Creek (−10%) are the exceptions. The fix,
when needed: let an editor click a start and end point to trim the first and last
way.

## Reading trails on the public map

The map at `/` is a **server component**. It reads Payload through the Local API
— a typed function call, no HTTP hop — and passes the trails into the client map
as props:

```
app/(frontend)/page.tsx   getCityTrails(activeCityId)   ← Local API, revalidate 60
        ↓ props
HomeClient.tsx            setMountainBikeTrails(trails) ← during render
        ↓
data/trail-source.ts      getMountainBikeTrails()       ← what every consumer reads
```

Consumers call `getMountainBikeTrails()` rather than importing an array, because
a `const` binding would capture the checked-in data at import time and never see
the database rows. `utils/map.ts` builds its `trailByName` / `osmIdOwner` lookups
lazily for the same reason, and drops them when the list changes.

Geometry follows the same path: Bend's curated layer points at
`/api/map/trails?city=bend` instead of the static file.

### Seeding

One script per city, because their pipelines genuinely differ:

| | `pnpm db:seed:bend` | `pnpm db:seed:chattanooga` |
|---|---|---|
| Trails | 182 | 224 |
| Geometry | `public/data/bend/trails.geojson`, by slug | none — its lines live in a Mapbox tileset |
| `osmIds` | yes | none |
| `geometrySource` | `osm` — rebuildable from OSM | `imported` — the rebuild hook skips it |

(`edited` is the third value, set by the geometry editor rather than a seed.)

**Only Bend is seeded by default.** Chattanooga doesn't fit the OSM-referenced
model yet, so importing it would add several hundred rows the editor can't
meaningfully work on. Run its script deliberately when you want them; whether
its trails *can* be matched to OSM ways is the open question in ADR-0001.

Both take `--dry-run`, and both pass `context.skipOsmRebuild` — without it the
`beforeChange` hook fires one Overpass request per row and gets the machine
rate-limited. Re-running either is safe: rows match on `(trailName, city)`.

### It degrades rather than breaks

`getCityTrails` **never throws**, and it distinguishes three outcomes so callers
don't confuse them:

| `status` | Meaning | API returns |
|---|---|---|
| `ok` | rows found | the FeatureCollection |
| `empty` | database answered; this city has none seeded | an empty FeatureCollection, 200 |
| `unavailable` | no `DATABASE_URL`, or the query failed | 503 |

`empty` is a real answer, not a failure — reporting it as 503 would send someone
debugging a database that is working fine.

In every no-rows case the client keeps the checked-in data, because
`setMountainBikeTrails` ignores an empty list. Losing the CMS must not take the
public map down with it.

**One gap:** that fallback covers trail *metadata*, not *geometry*. With the
database down, `/api/map/trails` returns 503 and Bend's curated lines won't
draw, even though the sidebar still lists them. Restoring a static-file fallback
for geometry is unfinished work.

### Cache

`revalidate = 60` on both the page and the API, so an edit in `/admin` is live
within a minute without a rebuild. Trail edits are rare and the payload is a few
hundred rows, so this serves a cached render and refreshes in the background
rather than hitting the database per request.

## Admin appearance

Two layers, so the common case needs no code:

1. **`src/app/(payload)/custom.css`** — the defaults. Sets CSS custom properties
   only, never Payload's own selectors, because variables are a supported
   surface and class names like `.btn__content` are internals that move between
   releases. It's unlayered while Payload's styles live in
   `@layer payload-default, payload`, so unlayered rules win and nothing needs
   `!important`.
2. **Settings → Theme** (`/admin/globals/theme`) — editable in the UI, stored in
   the database, injected by the admin layout as variables that override the
   stylesheet. Colour swatches, corner style, font, neutral tint, plus a custom
   CSS escape hatch.

Every theme field is optional: an unset field falls through to the stylesheet
default, so clearing a field is how you reset it.

**The one trick worth knowing:** `--theme-elevation-*` — the greys the whole UI
is built from — all resolve to a `--color-base-*` scale, and Payload derives
dark mode by *inverting* that scale. So retinting the base ramp once themes both
modes coherently, which is why "neutral tint" is a single setting rather than
two.

`customCss` is injected verbatim, so `sanitizeCss` strips `<` and `>` — a stray
`</style>` would otherwise turn styling into markup. It's admin-only, but
"trusted input" is exactly how injection bugs get written.

Like the trail reader, `getThemeCss` **never throws**: no database, an
unreachable one, or an unset global all return an empty string and the
stylesheet defaults stand. Nobody should be locked out of the admin by a theme
row.

## How the admin is laid out

**Two entries sit above the groups** (`AdminNavLinks`, via
`admin.components.beforeNavLinks`), because neither is a collection:

- **Dashboard** — Payload ships no nav link back to it; the logo is the only way,
  and it doesn't read as navigation. Rendered as a `div` rather than a link when
  you are already there, matching what Payload does for the current page.
- **View map** — opens the public site, in a **new tab on purpose**: the admin is
  form-heavy and a trail being edited holds unsaved geometry, so navigating away
  in the same tab would quietly discard it.

Both reuse Payload's own `nav__link` classes. That is against the usual rule of
leaving their selectors alone, and deliberately so — the rule is about
*overriding* their styles, whereas these have to be pixel-identical to a dozen
native links inches away. If Payload renames the classes these render unstyled
but still work; a hand-styled version that drifts is conspicuously wrong on every
page. The markup mirrors `DefaultNavClient` in `@payloadcms/next`.

**Navigation** groups by what you are doing, not by what the thing is:

| Group | What's in it |
|---|---|
| **Trails** | Trails. The daily job, on its own so it is never something to scroll past. |
| **Lists** | Trail complexes, ratings, kinds, stewards — everything that exists only to populate a dropdown on a trail. Named for what a curator does with them rather than what they are; "Vocabulary" and "Taxonomy" are terms for people who build CMSes, not people who maintain trails. |
| **Settings** | Theme, users. |

**The trail form** is three unnamed tabs:

| Tab | Holds |
|---|---|
| **Details** | Trail name, complex, steward, rating, kind — plus an **Advanced** section, collapsed, for the fields that fill themselves in |
| **Geometry** | The map editor, the picked ways, the rebuild checkbox |
| **Measurements** | Distance, elevation, bounds, the build report — all read-only |

`geometrySource` sits in the **sidebar** rather than in a tab, because it
decides what the Geometry tab will do on the next save and reading it should not
mean navigating away from the map.

Details is ordered by what a curator does rather than by what the fields are.
`trailName` is first because it is the only name anyone types — `displayName`
and `slug` follow from it and are usually left exactly as they land, so they
live in **Advanced**. Having them first meant the first two boxes on a new trail
were ones you were not supposed to touch, above the one that drives them.
"Advanced" is deliberately a general label: it is where anything self-managing
goes, and the section's description carries the specifics so the label survives
the next field landing there.

**The tabs must stay unnamed.** A named tab nests its fields under that key in
the document *and* the database, so naming these would rename every column and
break the seeds, the read path, and the public map — to move boxes around on
screen. `payload migrate:create` reports "No schema changes detected" for the
layout as it stands, and that is the check to re-run if you touch it.

The **dashboard** (`DashboardSummary`, wired through `admin.components.
beforeDashboard`) shows what needs attention: published and draft counts, trails
with no line, trails with no elevation chart, trails whose last build warned, and
the five most recently edited. It is additive — Payload's collection cards still
render below it, so the normal way into a collection survives this failing.

Two things it has to keep doing. `getTrailSummary` **never throws**, like
`getCityTrails` and `getThemeCss`: the dashboard is the first page after signing
in, so an exception there is an admin nobody can get into, over a decorative
panel. And an unreachable database shows `—`, never `0` — a zero is a claim.

One query in it is deliberately done in JavaScript. `osmReport` is a plain
`json` column, and asking Postgres whether its `warnings` array is non-empty
means indexing into it: `osmReport.warnings.0` compiles to a jsonb path Postgres
rejects outright, which took the whole panel down to `—`.

## Reference collections

Four fields on a trail are dropdowns backed by their own collections rather than
free text or a hardcoded `select`, so their options are editable without a
deploy:

| Collection | What it is |
|---|---|
| **Trail complexes** | What trails group under — "Phil's Trail Complex", "Swampy Lakes" |
| **Stewards** | Whoever looks after a trail — volunteer clubs (COTA, SORBA) and the land managers whose ground it crosses |
| **Trail ratings** | How trails are graded, and the colour each grade draws in |
| **Trail kinds** | What sort of thing a trail is, and its colour override and icon |

The sidebar hierarchy is **region → trail complex → trail**, so a complex is the
middle level and `region` is a field on it.

Payload keeps both honest: renaming one updates every trail pointing at it, and
it blocks deleting one still in use. Curating the lists is admin-only — which
is everyone today, see [Roles](#roles).

`recArea` used to be free text, which meant a typo silently created a new
sidebar grouping that looked real.

### Trail complexes also move `region` out of code

The sidebar groups complexes into regions ("Bend", "Cascade Lakes"), and that
mapping was a hardcoded `REGION_MAP` per city — so adding a complex meant
editing TypeScript. It's now a field on the complex.

`regionOf(trail)` in `src/data/trail-region.ts` is what every grouping call site
uses: it prefers the stored region and falls back to the built-in map when there
isn't one. That keeps the checked-in data working unchanged while making the
database the source of truth where it has an answer. **Group by `regionOf`, not
`regionFor`** — the latter can't see the database.

The seed populates `region` from each city's `regionFor`, so the mapping arrives
already filled in rather than blank.

**Naming:** only the admin labels say "trail complex". The slug and table are
still `trail-areas`, and the app-level field is still `recArea` — renaming those
would mean a migration plus a sweep through the checked-in data files and the
Python scripts that write them, for no user-visible gain.

### Ratings and kinds carry the palette

Difficulty and trail type were hardcoded `select`s, which meant adding a grade
was a code change, a Postgres enum migration, and a deploy. They are collections
now, and the **colour moved with them** — the palette lived in code for the same
reason, so recolouring "advanced" was also a release.

Nothing stores a colour per trail. `appearanceFor`
(`src/payload/read/appearance.ts`) derives colour, icon, and the rating key from
the two related rows on read, so recolouring a grade in the admin repaints every
trail carrying it:

| What | Comes from |
|---|---|
| Colour | the **kind's** colour if it sets one, else the **rating's** |
| Icon | the kind's `icon` key, mapped back by `iconForKind` |
| `trail.rating` | the rating's `value`, with `'unrated'` flattened to `''` |

The kind's colour is an *override*, and that is how greenways come out green
whatever their difficulty. Singletrack leaves it blank.

**`value` is the stable key, `name` is a label.** The app matches on `value` —
the sidebar's swatch shape, the seed scripts — and a curator may reword `name`
at any time. Renaming "Intermediate" to "Blue" must not repaint the map.

**Anything keyed by rating needs a fallback**, because a trail can now arrive
carrying a grade the code has never seen. `shapeFor` in `MountainBikeTrails.tsx`
is the pattern: a bare `TRAIL_SHAPE[rating]` miss returned `undefined`, which
left the swatch with no classes and collapsed it to nothing.

An icon can't round-trip through Postgres — a FontAwesome `IconDefinition` is an
object — so a kind stores a key from a short bundled set instead.

#### Migrating this pair needs a backfill

The relationship is **required**, so an empty vocabulary is a database you can't
create a trail in. `src/data/trail-vocabulary.ts` holds the defaults; the
migration seeds them, and `loadVocabulary` in the seed scripts re-creates any
that are missing while leaving existing rows alone (a curator may have
recoloured one, and reseeding *trails* has no business undoing that).

The generated migration drops the enum columns outright, which would blank every
trail's rating and kind — and since colour comes from them, produce an
unreadable map. The committed one creates the tables, seeds them, points every
trail *and every stored version* at the matching row, and only then drops. The
`trail-areas` migration has the same shape of trap and did not handle it.

Going back down is lossy by nature: the enum only holds what it shipped with, so
a rating a curator added comes back as `unrated`.

### City is hidden in the admin

A deployment serves one city, so the `city` picker is hidden on trails,
complexes, and stewards, defaulting to `activeCityId`. The column stays:
`getCityTrails` filters on it, the seeds set it per city, and user access is
scoped by it. Removing `hidden` brings the picker back for a multi-city admin.

## Where the elevation chart comes from

`/api/map/elevation/<slug>`, and nowhere else. It serves the `elevationProfile`
measured when the trail was last saved, recalculated whenever its ways change or
its line is redrawn.

The profile was never missing — `measureParts` samples the terrain on every save
to *produce* the distance and elevation totals, and used to discard the
per-point series it computed on the way. It is stored now and read back by
`src/payload/read/elevation.ts`, under the same never-throws rule as
`getCityTrails`: no database means no chart, not a broken page. The lookup is
scoped to `activeCityId`, which keeps it unambiguous without making slugs
globally unique — two cities may both have a "Ridge Trail", and only one is
being served.

### Why not the checked-in files

`public/data/elevation/*.json`, generated offline by
`scripts/add_trail_elevation.py`, are deliberately **not** consulted. Three
reasons, in order of how much they cost:

1. **They can't update themselves.** A trail whose ways were adjusted kept
   drawing the old chart while the sidebar showed the new distance — two numbers
   disagreeing on one screen, with no way to tell which was current.
2. **They only cover the two bundled cities.** This repo is meant to be stood up
   by any trail org for its own trails; such a deployment has a database and
   none of these files, so a path that depends on them is a path that only works
   here.
3. **They come from a different pipeline** — see below.

The cost is real and accepted: **a trail with no database row has no chart.**
That is Chattanooga today, whose geometry lives in a Mapbox tileset rather than
the CMS, so it is `imported` and there is no line here to sample. It gets its
own CMS; the files stay on disk until then.

`pnpm backfill:elevation` measures every trail that has geometry but no profile.
It samples terrain only — the geometry is already in the row — so it needs no
Overpass and is safe to run over every trail at once, and safe to re-run.

### The two pipelines do not agree, and the Python one is wrong about mountains

Comparing them on identical geometry, the sampling barely matters: our z14 / 20 m
grid and the script's z15 / 25 ft grid produce profiles within ~1% of each other,
and the min/max agree to the foot. What differs is the maths.

The script accumulates **raw sample-to-sample deltas** with no smoothing and no
dead-band, so on rolling ground it counts every DEM wiggle as climbing. Ours
smooths, rejects spikes, and only counts change past a dead-band. On sustained
climbs the two agree almost exactly; on rough flat ground the script reads much
higher.

Which is why `ELEVATION_SPIKE_MAX_RUN` exists. The spike filter replaces readings
further than 25 m from a running EMA, and on a sustained climb the EMA lags by
roughly `step * (1-alpha)/alpha` — on a 30% grade that lag alone crosses the
threshold with no spike anywhere in the data. The filter held its reference while
rejecting, so it could never catch up: one rejection 7% into O'Leary Mountain
flatlined the remaining 92% of the trail at 2,239 ft and reported **449 ft of
climbing on a trail that gains about 3,200**. Rejections are capped at five
consecutive samples now, after which the series is taken at face value.

Two traps in that code:

- The reject branch must **hold** the EMA, not advance it from the substituted
  value. `ema = alpha*ema + (1-alpha)*ema` is a no-op that reads like an update,
  which is how the original looked correct.
- A burst of bad readings and a real climb are identical point by point — losing
  satellite lock in a tunnel ramps away from the truth exactly the way a hillside
  does. Only the run length separates them, so the cap is the whole mechanism.

`computeElevation` is shared with recorded ride stats, so this fixed those too.

### `slug` and `displayName` fill themselves in

Both derive from `trailName`, and both used to be things you had to think about.
`slug` in particular was optional — "set this if it differs from the name" — so
a trail created in the admin was saved without one, and the chart above had
nothing to key on.

- **In the form**, `DerivedTextField` fills them as you type the trail name, so
  the value is visible before saving rather than materialising afterwards.
- **Everywhere else**, the field `beforeValidate` hooks (`derivedFrom` in
  `Trails.ts`) do the same, so `required` isn't a trap for the REST API, the
  seeds, or a script. Field `beforeValidate` runs *before* `required` is
  checked — unlike collection `beforeChange`, which runs before field validation
  entirely.

**Both only ever fill a blank.** Display names are routinely deliberately
different from the raw tileset `trailName`, and slugs don't all match their
names: `slugify('Tiddlywinks (Upper)')` is `tiddlywinks-(upper)`, while the trail
is `tiddlywinks-upper` and a static elevation file is named after it. Rewriting
that on open would break a chart by doing nothing but visiting the page.

## Roles

**There is one role: admin.** Everyone who can sign in can edit everything.

There used to be an editor role, and it was half-built in a way that bit: it was
the *default* for a new account, and `cityScoped` gives a non-admin with no city
set **no rows at all** — so an account created through the admin arrived unable
to see a single trail, with nothing on screen explaining why. One role is the
honest description of what is implemented.

What stays, deliberately:

- **The `role` field**, so adding a second role is a config change rather than a
  migration.
- **Every access rule asks for `'admin'` by name**, not merely "is signed in".
  That is the difference between adding a role later and *auditing* for one: a
  new role lands with no permissions and is granted them on purpose, instead of
  silently inheriting write access to every collection the moment it exists.
- **`cityScoped` on Trails** (`src/payload/collections/Trails.ts`), which is
  therefore dead code today — admins match its first branch. ADR-0001 wants city
  scoping from day one rather than bolted on, and a scoping rule written later
  against live data is the kind that gets one case wrong.
- **`city` on a user**, hidden while admin is the only role. Its `condition`
  brings it back on its own once a role that isn't admin exists.

So the way to add an editor role is: add the option to `role`, add the `city`,
and then go through the access rules deciding what it may do. None of them will
have quietly decided for you.

Narrowing the enum promotes any existing editor to admin rather than failing the
migration on a value the new type doesn't have — logged by email, since it is a
privilege change.

## Things that will trip you up

<<<<<<< HEAD
The full list lives in [CLAUDE.md](../../CLAUDE.md); this is the one that costs
the most time to diagnose.

**The app has no root layout, on purpose.** Payload's `RootLayout` renders its
own `<html>`/`<body>`, so the public app lives in `src/app/(frontend)/` with its
own. A layout at `src/app/` nests a second `<html>` inside Payload's, and the
symptom is not a crash — the admin renders and its inputs silently stop
accepting clicks. `favicon.ico` and `manifest.ts` stay at `src/app/`, since Next
resolves metadata files from the app root.

## Not built yet

- **Trimming ways** to a start/end point — see Accuracy.
- **Trails not in OSM.** Every trail must be mapped upstream first; brand-new or
  deliberately unmapped ones need an OSM edit or a local-geometry escape hatch.
- **Migrating Chattanooga's 220 trails.** They have no `osmIds` and render from
  a Mapbox tileset. Worth testing with `scripts/align_bend_geometry.py` against
  Tennessee.
=======
- **The project is ESM** (`"type": "module"`) — Payload 3's CLI requires it. New
  root config files must be ESM or `.cjs`.
- **The app has no root layout.** Payload's `RootLayout` renders its own
  `<html>`/`<body>`, so the public app had to move into `src/app/(frontend)/`
  with its own layout. Leaving a layout at `src/app/` nests a second `<html>`
  inside Payload's, and the symptom is not an obvious crash — the admin renders
  but its inputs stop accepting clicks. `favicon.ico` and `manifest.ts` stay at
  `src/app/`, since Next resolves metadata files from the app root.
- **Don't add a route at `/api/<collection-name>`.** Payload mounts its REST API
  there, so `/api/trails` would shadow the trails collection's list endpoint.
- **`graphql` is pinned to v16.** Payload peer-depends on `^16.8.1`; a fresh
  install pulls 17.
- **Overpass is a shared community endpoint.** It rate-limits (429) and sheds
  load (504) routinely — the client retries with backoff, and it's easy to get
  temporarily blocked when scripting bulk requests. Point `--overpass-url` style
  overrides at a private instance for anything bulk.
- **`push` is off.** Schema changes go through `pnpm db:migrate:create`; re-run
  `pnpm generate:types` after a collection change and commit both.
- **Re-run `pnpm generate:importmap`** after adding or renaming an admin
  component, or Payload won't find it.
- **Collection `beforeChange` hooks run before field `validate`.** A field
  validator only ever sees what the hooks returned, so server-side checks that
  must not be bypassed belong in the hook. See "How a save works".
- **Generated, lint-excluded**: `src/payload-types.ts`, `src/migrations/`,
  `src/app/(payload)/admin/importMap.js`.

## Not built yet

- **Trimming ways** to a start/end point — see Accuracy above. The geometry
  editor is a manual workaround: drag the endpoint back to where the trail
  actually starts. That flips the trail to `edited`, so it's a trade, not a fix.
- **Migrating the existing 406 trails.** Chattanooga's trails have no `osmIds`
  at all — they render from a Mapbox Studio tileset. Whether they can move to
  this model is an open question worth testing with
  `scripts/align_bend_geometry.py` against Tennessee.
>>>>>>> d89a213 (feat: curate trails in the CMS — geometry editor, lists, elevation)
- **Serving the map from the database.** Still reads `src/data/`.
