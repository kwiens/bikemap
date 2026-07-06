# MTB Project Trail Validation

This repo can compare our curated MTB trail manifest against MTB Project route
metadata exposed through the Backcountry web app, but it should not use that
metadata as a source of truth or as a bulk data source. The tooling is
intentionally scoped to the app's existing curated trail areas.

## Boundary

Allowed use in this repo:

- Query small bounding boxes derived from trails we already curate.
- Keep only minimal validation fields: route id, name, point location, length,
  elevation summary, difficulty, path kind, and source identifiers.
- Write output to ignored `tmp/mtb-project-validation/` files.

Not supported:

- Crawling whole states such as Tennessee or Oregon.
- Copying route descriptions, photos, reviews, geometry, or other rich third-party
  content into the app.
- Committing authenticated Backcountry responses or bearer tokens.

For state-scale coverage, use public/open data sources with compatible terms
such as OSM/Overpass, local open GIS exports, or directly licensed datasets.

## How Access Works

1. Log in to <https://webmap.onxmaps.com/backcountry/map> in a browser.
2. Open DevTools Network and filter for `v1/supergraph`.
3. Select a request from the Backcountry web app.
4. Copy only the `authorization: Bearer ...` value.
5. Export it in your shell:

   ```bash
   export MTB_PROJECT_BEARER_TOKEN='ory_at_...'
   ```

Do not put this token in `.env.local`, source files, shell history you intend to
share, PR comments, or docs.

The relevant GraphQL shape discovered from the web app is:

```graphql
query BikeRoutesByBounds {
  bikeRoutes(
    filter: {
      location: {
        withinBounds: { bottom: 34.9, left: -85.4, right: -85.0, top: 35.2 }
      }
    }
    limit: 50
  ) {
    id
    name
    location
    length
    elevationGain
    elevationLoss
    difficultyRating
    pathKind
    identifiers
  }
}
```

The API caps this query at 50 routes. `scripts/mtb_project_trail_validation.py`
handles that only by recursively splitting the small local trail-area boxes. It
refuses state-style runs by design.

## Run Validation

Dry-run the local query boxes:

```bash
python scripts/mtb_project_trail_validation.py --city chattanooga --dry-run
```

Fetch MTB Project metadata for Chattanooga's curated trail areas and compare:

```bash
MTB_PROJECT_BEARER_TOKEN='ory_at_...' \
  python scripts/mtb_project_trail_validation.py --city chattanooga
```

Compare again from an existing cached response without using the network:

```bash
python scripts/mtb_project_trail_validation.py \
  --city chattanooga \
  --route-json tmp/mtb-project-validation/chattanooga/mtb-project-bike-routes.json \
  --no-fetch
```

Limit to one recreation area:

```bash
MTB_PROJECT_BEARER_TOKEN='ory_at_...' \
  python scripts/mtb_project_trail_validation.py \
  --city chattanooga \
  --area "Enterprise South"
```

Bend uses the same command and reads
`src/data/cities/bend/mountain-bike-trails.data.ts`. If that generated file is
absent, there is no local Bend trail inventory for this validator to compare.

State presets are intentionally rejected:

```bash
python scripts/mtb_project_trail_validation.py --region tn
# State-wide MTB Project extraction is intentionally unsupported...
```

## Outputs

Default output directory:

```text
tmp/mtb-project-validation/<city>/
```

Files:

- `mtb-project-bike-routes.json`: minimal MTB Project route metadata, plus
  query-area summaries.
- `mtb-project-validation-report.json`: strong matches, possible matches,
  unmatched local trails, unmatched MTB Project routes, and distance flags.
- `mtb-project-validation-report.csv`: spreadsheet-friendly version of the report.
- `cache/*.json`: one file per queried bbox so retries do not re-hit the API.

These files are local scratch output. `tmp/` is gitignored.

## Matching Notes

The report uses a one-to-one greedy name match with a small location bonus and a
distance penalty for far-away routes. Treat it as triage, not a final decision.

Common cases to review manually:

- `possibleMatches`: typos or naming variants, such as alternate spellings.
- `unmatchedLocal`: local trails the route service does not expose as BikeRoute
  records, or local entries that are greenways/OHV routes rather than MTB trails.
- `unmatchedMtbProject`: MTB Project routes near our trail areas that may be
  loops, composites, connectors, or trails missing from our manifest.
- `distanceIssues`: names match but lengths differ by at least `0.3 mi` and
  `25%`; often caused by source datasets splitting/combining segments differently.
