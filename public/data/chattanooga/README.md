# Deprecated static trail data

Payload is the authoritative source for Chattanooga trail geometry.

`trails.geojson` and `trails-supplemental.geojson` are deprecated transition
artifacts staged for removal. They currently remain for two bounded reasons:

- bootstrapping a fresh database through `pnpm db:seed:chattanooga`;
- keeping a temporary static map fallback when Payload is unavailable or empty.

Do not add new runtime consumers or edit the generated combined file by hand.
Remove both files, their converter plumbing, and `geojsonFallbackUrl` together
after a database-native bootstrap exists and the map has an explicit database
outage experience. Committed Payload migrations remain immutable history and
are not part of this removal.
