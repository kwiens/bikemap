# Trail conditions

The map says how hard a trail is and how much it climbs. Neither answers the
question a rider actually has on a Saturday morning: **is it rideable today?**

That answer changes daily, it comes from whoever rode it last, and no trail org
has the staff to keep it current by hand. So anyone can file a report — no
account, no email — from the trail they are already looking at. What they can
report is curated in the admin.

---

## What a report is

A **condition** and a **date**. That is the whole thing.

Deliberately. Each of the obvious additions was considered and left out:

- **A note** needs moderating, and a free-text field on an anonymous form is the
  single most abused thing on the internet.
- **A photo** needs blob storage, which every fork would have to configure — and
  image moderation, which is a different project.
- **A name** nobody verifies is decoration that reads like attribution.

The date is when the trail was *ridden*, not when the form was submitted, so
someone can log Saturday's ride on Sunday morning. It is bounded: no more than
30 days back, no more than a day forward.

## Where it shows

- **A pill on each sidebar trail row**, so you can scan a whole complex at once.
- **The selected-trail pane**, with the age, a history disclosure, and the
  button that opens the form.

Both go through `ConditionBadge`, which is also where the staleness rule lives.

## Closed trails show on the map

A trail whose **newest report** carries a condition flagged "Mark the trail as
closed on the map" is drawn as a **red dashed line over its normal one**.

An overlay rather than a recolour: the green/blue/black rating colours are what
the legend and the sidebar swatches mean, and turning a closed trail red would
leave the two disagreeing. The dash is what carries the meaning, so it still
reads without relying on colour at all.

**Which conditions close a trail is data, not code.** `marksClosed` is a
checkbox on the condition type — seeded on "Closed", and a curator can tick it on
"Snow / ice" too. Nothing in the app matches on the value `'closed'`.

**A closure does not expire.** Everything else fades after
`CONDITION_FRESH_DAYS`; a closure holds until somebody reports the trail as
something else. A closure is a state, not an observation — a trail does not
quietly reopen because nobody has ridden it in a fortnight, and expiring one
would take a barrier off the map on a timer. `isConditionCurrent` is where that
rule lives; ask it rather than `isConditionFresh` on anything user-facing.

That is also why `getConditionSummary` has **no date floor** on its query. A
window would silently reopen a trail shut last season. The row limit is the
bound instead: newest-first means the newest report per trail is in the result
while total non-hidden reports stay under it. Past that, the answer is a
current-condition column on the trail.

**The "closed to reports" switches do not do this.** Those are moderation — an
admin muting a trail that is attracting nonsense should not paint it closed for
riders. Only a condition marks the map.

### Staleness is a feature

A report stops driving the badge after `CONDITION_FRESH_DAYS` (14). It stays in
the trail's history; it just stops being presented as the current answer.

This matters more than it sounds. A stale condition is worse than no condition:
a green "Dry" pill left over from October is not merely unhelpful in March, it
is *wrong in a way that looks authoritative*, and someone drives to a trailhead
on it. When the newest report has aged out, the pane says "last reported 3
months ago — dry" instead, which is information rather than a claim.

## The collections

| | slug | group | what it is |
|---|---|---|---|
| Trail conditions | `trail-condition-types` | Lists | the dropdown's options |
| Condition reports | `trail-conditions` | Conditions | the reports themselves |

`trail-condition-types` is the same curated-vocabulary pattern as trail ratings
and kinds — name, stable `value`, colour, sort order — because conditions are
*local*. "Dusty / loose" is the interesting distinction in Bend in August and
meaningless in a Tennessee spring; "Snow / ice" is the reverse.

Two things follow from it being data:

- **Colour comes off the row**, never off the report. Recolouring a condition in
  the admin repaints every badge that ever used it.
- **`value` is the stable key.** `name` is a label a curator may reword at any
  time. Never match on it.

Retire an option by unticking **Offer this on the report form** rather than
deleting it — Payload blocks deleting a row a past report still points at, and
that block is correct.

## Closing a trail to new reports

Three switches, and **any one of them being off is enough**:

| Where | What it closes |
|---|---|
| Settings → **Condition reporting** | the whole map |
| A **trail complex** → Condition reports | every trail in it |
| A **trail** → Condition reports | just that one |

Each carries an optional **note** — the sentence a rider sees where the "Report"
button was ("Closed for logging until 1 May"). The most specific one wins: trail,
then complex, then site-wide, then a plain fallback. Ticking the box and leaving
the note blank means "no comment", not "show an empty line".

The site-wide switch exists mainly **for a fork**. This repo is meant to be stood
up by any trail org, and some will want the curated trail data without a public
form on it; without this their only option is not deploying the feature. It is
also the fastest lever if the form is ever abused at scale.

### What closing does *not* do

**It stops new reports. It does not hide old ones.** The badge, the age and the
history all stay exactly as they were. Two reasons:

- On a closed trail, knowing it is closed — and what it was like when someone
  last rode it — is the most useful thing on the page. That is the whole reason
  you'd close it.
- Data gathered while the form was open does not stop being true because the
  form closed. Hiding it would be unsaying it.

### The button is a courtesy; the server is the gate

Hiding the button is cosmetic — a closed trail is one `curl` away from a report
otherwise. `submitConditionReport` re-checks all three switches and answers
**403** with the same message the button would have shown. It resolves precedence
through the same `resolveLockMessage`, so the two can't give different reasons.

Why 403 rather than 404 or 429: the trail is real and the rider has done nothing
wrong. Someone decided this one isn't taking reports, and the message says why.

### Why the flag is named for the exception

`conditionReportsClosed` defaults to `false` rather than a positive
`acceptConditionReports` defaulting to `true`. That is what let the migration be
purely additive: `ADD COLUMN ... DEFAULT false` leaves every trail that already
existed open, which is what it was a moment ago. The positive name would have
needed a data migration to say the same thing, and would have made the lookup
`equals: true` against a column full of nulls.

## Moderation

Reports are **live the moment they land**. An approval queue would make the
whole feature worthless: by the time someone got to it, the answer would be
about last week.

The lever is the `hidden` checkbox on a report. Tick it and the report leaves
the badge, the history and the API within about 30 seconds (the GET's cache
window). The row stays, so a pattern of abuse is still visible in the admin.

Sorting by **Reporter** groups everything from one source, which is how you undo
a spree in one pass.

There are **no drafts on this collection**, unlike Trails. A report is
append-only data written once and never edited; a `_trail_conditions_v` shadow
table would double the write volume to express one boolean.

---

## How an anonymous write stays safe

This is the only public write path in the application, so it is worth being
precise about.

### One door

`TrailConditions`'s access rules are **admin-only, on purpose** — they are not
an oversight left over from the signed-in collections. Payload mounts its own
REST API at `/api/trail-conditions`, and those rules are what keep it shut:

```
$ curl -X POST http://localhost:3000/api/trail-conditions -d '...'
403
```

The public write goes through `POST /api/map/conditions`, which validates the
submission itself and *then* calls Payload's Local API — which bypasses access
control by design. One door, and it is the guarded one.

**Relaxing `create` on the collection would quietly open a second, unguarded
door.** Don't.

### What guards it

`src/payload/conditions/guard.ts`, kept pure (no Payload import, no
`server-only`) so every rule in it is unit-testable without a database.

1. **A honeypot** — a hidden `website` field, positioned off-screen rather than
   `display: none`, which the better bots know to skip. A filled one gets a
   plain `200` with a success-shaped body and **no write**. Answering with an
   error would tell it which field is the trap, which is exactly the feedback
   needed to get past it next time.
2. **A rate limit**, keyed to a salted SHA-256 hash of the submitter's address:
   5 reports an hour across all trails, and one per trail per 30 minutes. The
   two stop different things — the hourly cap stops one person rewriting the map
   in an afternoon, the cooldown stops one opinion being repeated until it looks
   like a consensus.
3. **Validation** — the trail must be published in this city, the condition must
   be an active row, the date must be in the window.

### The threat model, stated plainly

This is a regional trail map. The realistic abuse is a bored local marking every
trail "Closed", or a scraper spraying a form it found. The two measures above
cover both, cost nothing, and add **no configuration a forker has to do** — which
was the requirement (ADR-0001, criterion C3).

Neither is a wall. `x-forwarded-for` is a client-settable header, trustworthy
only because something in front of the app rewrites it (true on Vercel and
behind a normal reverse proxy, false if the app is exposed directly). If this
map ever attracts a determined attacker, the answer is a captcha, and
`guard.ts` is the module it goes in.

### Privacy

**The IP address is never stored.** What lands in `reporterHash` is a salted,
truncated one-way hash — enough to count one person's reports and to find the
rest of them once one turns out to be abuse, and not enough to work backwards
to who they are.

Set `CONDITION_REPORT_SALT` to rotate the hashes (invalidating every rate-limit
bucket) without signing anyone out of the admin. Unset, it falls back to
`PAYLOAD_SECRET`, which is why it is optional.

---

## The pane opens for conditions now

`ElevationProfile` used to render `null` unless the trail had a chart, which was
fine while a chart was the only thing in it.

It now opens for **a chart or conditions**, with the chart, the y-axis, the
distance/climbing stats and the GPX button all conditional. Without that,
conditions would have been invisible on exactly the trails nobody has curated
yet — every Chattanooga trail, whose geometry still lives in a Mapbox tileset,
and any trail whose ways Overpass could not resolve.

The gate also tests that the vocabulary loaded: with no database there are no
options, and the pane must not open on an empty strip.

Conditions attach to a **curated trail**, so `curatedSlug()` returns `null` for
an OSM way picked off the nationwide layer, a bike route, or a recorded ride —
none of which have a row to hang reports on. It is stricter than `profileSlug()`
next to it, which invents a slug for an unrecognised name so the elevation fetch
has something to try.

---

## API

```
GET  /api/map/conditions?city=bend          → { options, latest }
POST /api/map/conditions?city=bend          → file a report
GET  /api/map/conditions/<slug>?city=bend   → { slug, reports }
```

Under `/api/map` for the usual reason: Payload owns `/api/<collection>`.

`latest` is keyed by **trail slug** — not name. Two complexes can and do have a
"Larry". So is `locked`, which lists only the closed trails with their resolved
message; `reporting: { enabled, message }` carries the site-wide switch so a
global closure needn't name every slug. `lockFor(summary, slug)` combines the
two — use it rather than reading either field directly, or the precedence gets
re-derived somewhere and drifts.

The GET caches for 30 seconds, much shorter than the trails route's hour,
because conditions are the one thing on this map that is supposed to change
during the day. The POST returns the report it just wrote so the client can show
it immediately rather than waiting the cache out — the rider who just filed it
is the one person guaranteed to be looking.

The GET has **no 503 branch**, unlike the trails route: `getConditionSummary`
answers empty on an unreachable database, and a map with no badges is the map as
it was last week. An error would have the client retrying over something
optional.

---

## Things that will bite you

- **`Trails` has a `beforeDelete` hook that clears a trail's reports first.**
  `trail_conditions.trail_id` is `NOT NULL` with an `ON DELETE SET NULL` foreign
  key — Payload generates that pair for a required relationship, and together
  they mean Postgres *refuses* to delete a trail anyone has ever reported on. If
  you see a not-null violation on `trail_id`, that hook is what stopped working.
- **Every read skips a report whose trail is null**, for the same reason. It
  should be unreachable, but a direct SQL delete would leave one, and it must
  not become a badge on no trail.
- **The provider layers locally-filed reports over every server response.** A
  refresh right after a submission can race the 30-second cache and come back
  without the report the rider just filed; watching your own report vanish reads
  as the submission having failed.
- **`conditionAgeLabel` switches to months at 60 days, not 30**, so it never has
  to say "1 months ago". The earlier version had a `'a month ago'` branch that
  was unreachable — the weeks branch ran to 62 days.
