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
import { CITY_IDS, parseCityId } from '@/data/cities';
import { getTrailConditionHistory } from '@/payload/read/conditions';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const city = parseCityId(new URL(request.url).searchParams.get('city'));

  if (!city) {
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
