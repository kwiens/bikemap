import { NextResponse } from 'next/server';
import { cityIds, isCityId } from '@/config/map.config';
import { getCityRoutes } from '@/payload/read/routes';

export const revalidate = 60;

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get('city');

  if (!isCityId(city)) {
    return NextResponse.json(
      { error: `city must be one of: ${cityIds.join(', ')}` },
      { status: 400 },
    );
  }

  const { geojson, status } = await getCityRoutes(city);
  if (status === 'unavailable') {
    return NextResponse.json(
      { error: 'Route database is unavailable.' },
      { status: 503 },
    );
  }

  return NextResponse.json(geojson, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
