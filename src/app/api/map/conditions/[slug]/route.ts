/**
 * One trail's condition history, newest first.
 *
 *   /api/map/conditions/pointe-break?city=bend
 *
 * A 404 means the trail is unknown; an empty list means nobody has reported on
 * it. The pane needs to tell those apart — the first is a bug, the second is an
 * invitation.
 */
import { NextResponse } from 'next/server';
import type { CityId } from '@/data/cities/types';
import { getTrailConditionHistory } from '@/payload/read/conditions';

const CITY_IDS: CityId[] = ['bend', 'chattanooga'];

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const city = new URL(request.url).searchParams.get('city') as CityId | null;

  if (!city || !CITY_IDS.includes(city)) {
    return NextResponse.json(
      { error: `city must be one of: ${CITY_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  const reports = await getTrailConditionHistory(slug, city);

  if (reports === null) {
    return NextResponse.json(
      { error: `No trail with the slug "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { reports, slug },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
      },
    },
  );
}
