import type { PayloadHandler } from 'payload';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { buildTrailFromOsm, type BuildReport } from '@/payload/osm/build';
import type { TrailGeometry } from '@/payload/osm/geometry';
import { parseOsmIds } from '@/payload/osm/ids';

export interface PreviewTrailGeometryResponse {
  geometry: TrailGeometry;
  measurements: {
    bounds: [number, number, number, number] | null;
    distance: number;
    elevationGain: number | null;
    elevationLoss: number | null;
    elevationMax: number | null;
    elevationMin: number | null;
  };
  message: string;
  profile: ElevationProfile | null;
  report: BuildReport;
}

interface PreviewRequest {
  name?: unknown;
  osmIds?: unknown;
}

interface ErrorResponse {
  message: string;
}

/** Builds a reviewable OSM line without changing the saved trail. */
export const previewTrailGeometry: PayloadHandler = async (req) => {
  if (!req.user) {
    return errorResponse('Sign in to refresh a trail line.', 401);
  }

  try {
    const body = (await req.json?.()) as PreviewRequest | undefined;
    const parsedIds = parseOsmIds(body?.osmIds);
    if (!parsedIds.ok) {
      return errorResponse(parsedIds.error, 400);
    }
    if (parsedIds.ids.length === 0) {
      return errorResponse(
        'Choose at least one OpenStreetMap trail segment first.',
        400,
      );
    }

    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name.trim()
        : 'Trail';
    const built = await buildTrailFromOsm(parsedIds.ids, name, {
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    });

    if (!built.geometry) {
      return errorResponse(
        built.report.warnings[0] ??
          'The selected OpenStreetMap segments did not produce a trail line.',
        422,
      );
    }

    return Response.json({
      geometry: built.geometry,
      measurements: {
        bounds: built.bounds,
        distance: built.distance,
        elevationGain: built.elevationGain,
        elevationLoss: built.elevationLoss,
        elevationMax: built.elevationMax,
        elevationMin: built.elevationMin,
      },
      message: 'Trail line preview refreshed. Save this trail to keep it.',
      profile: built.profile,
      report: built.report,
    } satisfies PreviewTrailGeometryResponse);
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: 'Could not build an OpenStreetMap trail line preview.',
    });
    return errorResponse(
      'The trail line could not be refreshed from OpenStreetMap. The saved line was not changed.',
      502,
    );
  }
};

function errorResponse(message: string, status: number): Response {
  return Response.json({ message } satisfies ErrorResponse, { status });
}
