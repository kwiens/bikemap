/**
 * A trail's elevation profile, served from Payload.
 *
 *   /api/map/elevation/pointe-break
 *
 * Shaped exactly like the static files the pane already reads
 * (public/data/elevation/<slug>.json), so the client can treat it as a second
 * place to look rather than a second format to understand.
 *
 * This exists because a trail created in the admin has no static file — those
 * are generated offline by `scripts/add_trail_elevation.py`, and nothing runs
 * between saving a trail and viewing it. The pane tries the static file first
 * (unchanged, and free for every checked-in trail) and falls back here.
 *
 * Under /api/map like the trails route, and for the same reason: Payload mounts
 * its own REST API at /api/<collection>.
 */
import { NextResponse } from 'next/server';
import { getTrailElevation } from '@/payload/read/elevation';

// Matches the page and the trails route: a profile changes when an editor
// saves, not per request.
export const revalidate = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const profile = await getTrailElevation(slug);

  if (!profile) {
    // A genuine 404: this trail has no stored profile. The pane treats it the
    // same as a missing static file — no chart, rather than an error.
    return NextResponse.json(
      { error: `No elevation profile for "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json(profile, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
