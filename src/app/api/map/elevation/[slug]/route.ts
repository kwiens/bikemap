/**
 * A trail's elevation profile, served from Payload.
 *
 *   /api/map/elevation/pointe-break?city=bend
 *
 * Shaped exactly like the static files in public/data/elevation/<city>/<slug>.json, so
 * the client can treat the two as one format in two places rather than two
 * formats.
 *
 * This exists because a trail created in the admin has no static file — those
 * are generated offline by `scripts/add_trail_elevation.py`, and nothing runs
 * between saving a trail and viewing it. The pane asks here first, because a
 * stored profile is remeasured on every save and a checked-in file cannot be;
 * on a 404 it falls back to the file, which is all a trail whose geometry isn't
 * in the database (or a deployment with no database) has.
 *
 * `city` is part of the lookup, not decoration: `slug` is indexed but not
 * unique, so two cities can share one. It is optional, and defaults to the city
 * the request's hostname maps to — never the module-scope `activeCityId`, which
 * on the server is always the env default city regardless of host.
 *
 * Under /api/map like the trails route, and for the same reason: Payload mounts
 * its own REST API at /api/<collection>.
 */
import { NextResponse } from 'next/server';
import { cityIds, isCityId, resolveActiveCityId } from '@/config/map.config';
import { getTrailElevation } from '@/payload/read/elevation';

// Matches the trails route: a profile changes when an editor saves, not per
// request.
export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // No `city` means "whichever city this hostname serves", the same resolution
  // the page does — so a link that omits it still lands on the right trail.
  const city =
    new URL(request.url).searchParams.get('city') ??
    resolveActiveCityId(hostnameOf(request));

  if (!isCityId(city)) {
    return NextResponse.json(
      { error: `city must be one of: ${cityIds.join(', ')}` },
      { status: 400 },
    );
  }

  const profile = await getTrailElevation(slug, city);

  if (!profile) {
    // A genuine 404: this trail has no stored profile. The pane treats it the
    // same as a missing static file — no chart, rather than an error.
    return NextResponse.json(
      { error: `No elevation profile for "${slug}" in ${city}.` },
      { status: 404 },
    );
  }

  return NextResponse.json(profile, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}

function hostnameOf(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    undefined
  );
}
