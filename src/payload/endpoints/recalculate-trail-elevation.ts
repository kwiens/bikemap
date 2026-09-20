import { APIError, type PayloadHandler } from 'payload';
import { isCityId } from '@/config/map.config';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { measureParts } from '@/payload/osm/measure';
import { getBundledElevationProfile } from '@/payload/read/bundled-elevation';
import { measurementsFromElevationProfile } from '@/utils/elevation-profile';

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
}

interface PreviewRequest {
  geometry?: unknown;
  name?: unknown;
}

interface ErrorResponse {
  message: string;
}

/** Calculates a reviewable elevation profile without changing the trail. */
export const recalculateTrailElevation: PayloadHandler = async (req) => {
  if (!req.user) {
    return errorResponse('Sign in to calculate trail elevation.', 401);
  }

  const id = readTrailId(req.routeParams?.id);
  if (!id) {
    return errorResponse('A trail id is required.', 400);
  }

  try {
    const trail = await req.payload.findByID({
      collection: 'trails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req,
    });
    const body = (await req.json?.()) as PreviewRequest | undefined;
    const geometry =
      body && Object.hasOwn(body, 'geometry') ? body.geometry : trail.geom;
    const parsed = parseTrailGeometry(geometry);

    if (!parsed.ok) {
      return errorResponse(parsed.error, 422);
    }

    let message: string;
    let measurements: RecalculateTrailElevationResponse['measurements'];
    let profile: ElevationProfile;

    if (parsed.parts.length === 0) {
      if (!isCityId(trail.city) || !trail.slug) {
        return errorResponse(
          'This trail has no line or bundled elevation profile to preview.',
          422,
        );
      }

      const bundled = await getBundledElevationProfile(trail.city, trail.slug);
      if (!bundled) {
        return errorResponse(
          'This trail has no line or bundled elevation profile to preview.',
          422,
        );
      }

      profile = bundled;
      measurements = measurementsFromElevationProfile(bundled);
      message =
        'Bundled elevation profile preview is ready. Save this trail to keep it.';
    } else {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!mapboxToken) {
        return errorResponse(
          'Elevation cannot be sampled because the Mapbox token is not configured.',
          503,
        );
      }

      const name =
        typeof body?.name === 'string' && body.name.trim()
          ? body.name.trim()
          : trail.displayName || trail.trailName || 'Trail';
      const measured = await measureParts(parsed.parts, name, { mapboxToken });

      if (
        !measured.profile ||
        measured.elevationGain === null ||
        measured.elevationLoss === null ||
        measured.elevationMax === null ||
        measured.elevationMin === null
      ) {
        return errorResponse(
          measured.warnings[0] ?? 'No elevation samples were returned.',
          502,
        );
      }

      profile = measured.profile;
      measurements = {
        bounds: measured.bounds,
        distance: measured.distance,
        elevationGain: measured.elevationGain,
        elevationLoss: measured.elevationLoss,
        elevationMax: measured.elevationMax,
        elevationMin: measured.elevationMin,
      };
      message = 'Elevation preview recalculated. Save this trail to keep it.';
    }

    return Response.json({
      measurements,
      message,
      profile,
    } satisfies RecalculateTrailElevationResponse);
  } catch (error) {
    const clientError = payloadErrorResponse(error);
    if (clientError) {
      return clientError;
    }
    req.payload.logger.error({
      err: error,
      msg: `Could not calculate elevation for trail ${String(id)}.`,
    });
    return errorResponse('Elevation could not be calculated.', 500);
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
      'You do not have permission to read this trail.',
      error.status,
    );
  }
  if (error.status === 404) {
    return errorResponse('This trail no longer exists.', 404);
  }

  return errorResponse(
    error.isPublic ? error.message : 'Elevation could not be calculated.',
    error.status,
  );
}
