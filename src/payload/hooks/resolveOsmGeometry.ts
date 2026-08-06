/**
 * Rebuilds a trail's geometry from the OSM ways it references, on save.
 *
 * This is what makes the trail editor an *online* flow: an editor picks ways,
 * presses save, and the geometry, distance, elevation, and bounds are derived
 * server-side. Nothing about the line is authored by hand, and re-saving after
 * OSM changes upstream is how a rerouted trail updates itself.
 *
 * Deliberately server-authoritative: the admin can suggest ways, but the values
 * that get stored are computed here from Overpass, not accepted from the client.
 */
import type { CollectionBeforeChangeHook } from 'payload';
import { buildTrailFromOsm } from '@/payload/osm/build';

/** Reads an osmIds value that may arrive as an array, a JSON string, or null. */
function readOsmIds(value: unknown): number[] {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => Number(entry))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export const resolveOsmGeometry: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const osmIds = readOsmIds(data.osmIds);
  const previousIds = readOsmIds(originalDoc?.osmIds);

  if (osmIds.length === 0) {
    // Clearing the ways clears what was derived from them, rather than leaving
    // a stale line attached to a trail that no longer claims it.
    if (previousIds.length > 0) {
      return {
        ...data,
        bounds: null,
        geom: null,
        osmReport: null,
      };
    }
    return data;
  }

  // Overpass is a shared community endpoint and terrain sampling is not free —
  // only rebuild when the ways actually changed, or when explicitly asked.
  const unchanged =
    operation === 'update' &&
    sameIds(osmIds, previousIds) &&
    Boolean(originalDoc?.geom) &&
    data.rebuildGeometry !== true;

  if (unchanged) {
    return { ...data, rebuildGeometry: false };
  }

  const name =
    (typeof data.displayName === 'string' && data.displayName) ||
    (typeof originalDoc?.displayName === 'string' && originalDoc.displayName) ||
    'Trail';

  try {
    const built = await buildTrailFromOsm(osmIds, name, {
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    });

    if (!built.geometry) {
      req.payload.logger.warn(
        `Trail "${name}": no geometry resolved from ${osmIds.length} OSM way(s).`,
      );
    }

    return {
      ...data,
      bounds: built.bounds,
      // Measured values overwrite whatever was in the form: they're derived,
      // and letting a stale form value win would silently desync them.
      distance: built.geometry ? built.distance : data.distance,
      elevationGain: built.elevationGain ?? data.elevationGain,
      elevationLoss: built.elevationLoss ?? data.elevationLoss,
      elevationMax: built.elevationMax ?? data.elevationMax,
      elevationMin: built.elevationMin ?? data.elevationMin,
      geom: built.geometry,
      osmIds,
      osmReport: {
        builtAt: new Date().toISOString(),
        gaps: built.report.gaps,
        missingIds: built.report.missingIds,
        resolvedIds: built.report.resolvedIds,
        warnings: built.report.warnings,
      },
      rebuildGeometry: false,
    };
  } catch (error) {
    // A save must not be lost because Overpass was rate-limiting. Keep whatever
    // geometry the trail already had and record why it didn't refresh.
    const message = error instanceof Error ? error.message : String(error);
    req.payload.logger.error(
      `Trail "${name}": OSM rebuild failed — ${message}`,
    );

    return {
      ...data,
      osmReport: {
        builtAt: originalDoc?.osmReport?.builtAt ?? null,
        gaps: originalDoc?.osmReport?.gaps ?? [],
        missingIds: originalDoc?.osmReport?.missingIds ?? [],
        resolvedIds: originalDoc?.osmReport?.resolvedIds ?? [],
        warnings: [
          `Could not rebuild from OSM: ${message}. The previous geometry was kept — save again to retry.`,
        ],
      },
      rebuildGeometry: false,
    };
  }
};
