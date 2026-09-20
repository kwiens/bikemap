import { revalidatePath } from 'next/cache';
import { APIError, type PayloadHandler } from 'payload';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { measureParts } from '@/payload/osm/measure';
import type { Trail } from '@/payload-types';

export interface RecalculateTrailElevationResponse {
  message: string;
  measurements: {
    bounds: [number, number, number, number] | null;
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    elevationMax: number;
    elevationMin: number;
  };
  profile: ElevationProfile;
  updatedAt: string;
}

interface ErrorResponse {
  message: string;
}

/**
 * Re-measures one trail from the geometry already saved in Payload.
 *
 * This is intentionally narrower than saving the whole trail: it never
 * refetches OSM ways and never accepts geometry or measurements from the
 * browser. The same `measureParts` function used by the save hook remains the
 * sole authority for distance, bounds, aggregate elevation, and chart points.
 */
export const recalculateTrailElevation: PayloadHandler = async (req) => {
  if (!req.user) {
    return errorResponse('Sign in to recalculate trail elevation.', 401);
  }

  const id = readTrailId(req.routeParams?.id);
  if (!id) {
    return errorResponse('A trail id is required.', 400);
  }

  try {
    // `draft: true` reads the latest saved version. The matching flag on the
    // update below preserves that version's status instead of publishing a
    // draft or quietly turning a published trail into one.
    const trail = await req.payload.findByID({
      collection: 'trails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req,
    });
    const parsed = parseTrailGeometry(trail.geom);

    if (!parsed.ok) {
      return errorResponse(parsed.error, 422);
    }
    if (parsed.parts.length === 0) {
      return errorResponse(
        'This trail has no saved geometry to measure. Add or import a line, save the trail, then try again.',
        422,
      );
    }

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return errorResponse(
        'Elevation cannot be sampled because the Mapbox token is not configured.',
        503,
      );
    }

    const measured = await measureParts(
      parsed.parts,
      trail.displayName || trail.trailName || 'Trail',
      { mapboxToken },
    );

    // A transient tile failure must not erase a profile that is already good.
    // `measureParts` can still return an accurate distance in this case, but
    // this endpoint exists specifically to refresh elevation as one unit.
    if (
      !measured.profile ||
      measured.elevationGain === null ||
      measured.elevationLoss === null ||
      measured.elevationMax === null ||
      measured.elevationMin === null
    ) {
      return errorResponse(
        measured.warnings[0] ??
          'No elevation samples were returned. The existing measurements were left unchanged.',
        502,
      );
    }

    const updated = await req.payload.update({
      collection: 'trails',
      context: { skipOsmRebuild: true },
      data: {
        bounds: measured.bounds,
        distance: measured.distance,
        elevationGain: measured.elevationGain,
        elevationLoss: measured.elevationLoss,
        elevationMax: measured.elevationMax,
        elevationMin: measured.elevationMin,
        elevationProfile:
          measured.profile as unknown as Trail['elevationProfile'],
      },
      draft: trail._status === 'draft',
      id,
      overrideAccess: false,
      overrideLock: false,
      req,
    });

    // The public elevation route is otherwise allowed to serve a stale profile
    // while it revalidates. Cache invalidation is best-effort: the database
    // update has already succeeded, so a cache problem must not report the
    // recalculation itself as failed or tempt a curator into retrying the write.
    if (trail.slug) {
      try {
        revalidatePath(`/api/map/elevation/${encodeURIComponent(trail.slug)}`);
      } catch (error) {
        req.payload.logger.warn({
          err: error,
          msg: `Trail ${String(id)} was recalculated, but its public elevation cache could not be invalidated.`,
        });
      }
    }

    return Response.json({
      measurements: {
        bounds: measured.bounds,
        distance: measured.distance,
        elevationGain: measured.elevationGain,
        elevationLoss: measured.elevationLoss,
        elevationMax: measured.elevationMax,
        elevationMin: measured.elevationMin,
      },
      message: 'Elevation profile recalculated.',
      profile: measured.profile,
      updatedAt: updated.updatedAt,
    } satisfies RecalculateTrailElevationResponse);
  } catch (error) {
    const clientError = payloadErrorResponse(error);
    if (clientError) {
      return clientError;
    }
    req.payload.logger.error({
      err: error,
      msg: `Could not recalculate elevation for trail ${String(id)}.`,
    });
    return errorResponse(
      'Elevation could not be recalculated. The existing measurements were left unchanged.',
      500,
    );
  }
};

function readTrailId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return null;
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ message } satisfies ErrorResponse, { status });
}

function payloadErrorResponse(error: unknown): Response | null {
  if (
    !(error instanceof APIError) ||
    error.status < 400 ||
    error.status >= 500
  ) {
    return null;
  }

  if (error.status === 401 || error.status === 403) {
    return errorResponse(
      'You do not have permission to recalculate this trail.',
      error.status,
    );
  }
  if (error.status === 404) {
    return errorResponse('This trail no longer exists.', 404);
  }
  if (error.status === 409 || error.status === 423) {
    return errorResponse(
      'This trail is locked by another editor. Try again after they finish.',
      error.status,
    );
  }

  return errorResponse(
    error.isPublic
      ? error.message
      : 'The trail could not be updated. Its measurements were left unchanged.',
    error.status,
  );
}
