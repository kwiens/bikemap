/**
 * Trail conditions: the current picture, and the way to add to it.
 *
 *   GET  /api/map/conditions?city=bend   → { options, latest, locked, reporting }
 *   POST /api/map/conditions             → file a report
 *
 * Under /api/map because Payload owns /api/<collection>, and
 * /api/trail-conditions is deliberately shut. **This is the only public write
 * path in the app**; everything it lets through, it has checked first.
 *
 * Both verbs share a file so the client has one URL — hence the GET's caching is
 * a header, not `export const revalidate`, which applies to the whole segment.
 */
import { NextResponse } from 'next/server';
import { CITY_IDS, type CityId, parseCityId } from '@/data/cities';
import {
  clientAddress,
  hashReporter,
  isHoneypotTripped,
  parseIdentifier,
  parseObservedAt,
  reporterSalt,
  type ReportBody,
} from '@/payload/conditions/guard';
import { submitConditionReport } from '@/payload/conditions/submit';
import { getConditionSummary } from '@/payload/read/conditions';

export const dynamic = 'force-dynamic';

function cityFrom(request: Request): CityId | null {
  return parseCityId(new URL(request.url).searchParams.get('city'));
}

export async function GET(request: Request) {
  const city = cityFrom(request);

  if (!city) {
    return NextResponse.json(
      { error: `city must be one of: ${CITY_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  // No 503 branch, unlike the trails route: `getConditionSummary` answers empty
  // on an unreachable database, and a map with no badges beats a client
  // retrying over something optional.
  const summary = await getConditionSummary(city);

  return NextResponse.json(summary, {
    headers: {
      // Shorter than the trails route's hour: conditions are meant to change
      // during the day.
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
    },
  });
}

export async function POST(request: Request) {
  const city = cityFrom(request);

  if (!city) {
    return NextResponse.json(
      { error: `city must be one of: ${CITY_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  // Answered with a lie: telling it the field was a trap only teaches it which
  // one to leave alone. It gets the success it expected, and nothing is written.
  if (isHoneypotTripped(body)) {
    return NextResponse.json({ ok: true });
  }

  const slug = parseIdentifier(body.slug);
  const condition = parseIdentifier(body.condition);
  if (!slug || !condition) {
    return NextResponse.json(
      { error: 'A trail and a condition are required.' },
      { status: 400 },
    );
  }

  const observedAt = parseObservedAt(body.observedAt);
  if (!observedAt.ok) {
    return NextResponse.json({ error: observedAt.error }, { status: 400 });
  }

  const result = await submitConditionReport({
    city,
    condition,
    observedAt: observedAt.value,
    reporterHash: hashReporter(clientAddress(request.headers), reporterSalt()),
    slug,
  });

  if (!result.ok) {
    // 403 for a closed trail: it's real and the rider has done nothing wrong.
    const status = {
      locked: 403,
      'not-found': 404,
      'rate-limited': 429,
      unavailable: 503,
    }[result.reason];
    return NextResponse.json({ error: result.message }, { status });
  }

  // The report comes back so the client can show it without waiting out the
  // GET's cache — the rider who filed it is the one person certain to be looking.
  return NextResponse.json({ ok: true, report: result.report });
}
