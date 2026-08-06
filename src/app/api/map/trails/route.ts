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
import type { CityId } from '@/data/cities/types';

const CITY_IDS: CityId[] = ['bend', 'chattanooga'];

// Matches the page's revalidate: geometry changes when an editor saves, not
// per request.
export const revalidate = 60;

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get('city') as CityId | null;

  if (!city || !CITY_IDS.includes(city)) {
    return NextResponse.json(
      { error: `city must be one of: ${CITY_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  const { fromDatabase, geojson } = await getCityTrails(city);

  if (!fromDatabase) {
    // Better an explicit error than an empty FeatureCollection, which the map
    // would render as "this city has no trails".
    return NextResponse.json(
      { error: 'Trail database is unavailable.' },
      { status: 503 },
    );
  }

  return NextResponse.json(geojson, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
