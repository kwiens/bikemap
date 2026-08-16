/**
 * Curated trail geometry as GeoJSON, served from Payload.
 *
 * Shaped exactly like the static files the map already reads
 * (public/data/bend/trails.geojson), so a city switches from a checked-in file
 * to the database by changing one URL in its config.
 *
 *   /api/map/trails?city=bend
 *
 * Lives under /api/map rather than /api/trails on purpose: Payload mounts its
 * own REST API at /api/<collection>, so a route at /api/trails would shadow the
 * trails collection's list endpoint.
 */
import { NextResponse } from 'next/server';
import { getCityTrails } from '@/payload/read/trails';
import { CITY_IDS, parseCityId } from '@/data/cities';

// Matches the page's revalidate: geometry changes when an editor saves, not
// per request.
export const revalidate = 60;

export async function GET(request: Request) {
  const city = parseCityId(new URL(request.url).searchParams.get('city'));

  if (!city) {
    return NextResponse.json(
      { error: `city must be one of: ${CITY_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  const { geojson, status } = await getCityTrails(city);

  if (status === 'unavailable') {
    return NextResponse.json(
      { error: 'Trail database is unavailable.' },
      { status: 503 },
    );
  }

  // `empty` is a real answer, not a failure: a city with no seeded trails (or
  // one whose geometry lives elsewhere, like Chattanooga's Mapbox tileset)
  // legitimately has no curated GeoJSON. Reporting that as 503 would send
  // someone debugging a database that is working fine.

  return NextResponse.json(geojson, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
