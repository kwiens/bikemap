/**
 * Keeps a trail's line and its measurements in step, on save.
 *
 * Geometry reaches a trail two ways, and this hook owns both:
 *
 *   osm      the line is rebuilt from the OSM ways the trail references. This
 *            is the default and the one to prefer — the geometry stays
 *            maintained upstream, so community fixes flow in for free.
 *   edited   the line was adjusted by hand in the geometry editor. It is left
 *            exactly as drawn, but distance, elevation, and bounds are
 *            re-measured from it so they never drift from the line on screen.
 *
 * ('imported' is the third case — geometry that came from somewhere else
 * entirely, today a Mapbox tileset. It is left completely alone.)
 *
 * Both paths are server-authoritative: the admin can supply ways or a line, but
 * every derived number is computed here, never accepted from the client.
 */
import { ValidationError, type CollectionBeforeChangeHook } from 'payload';
import { gapsBetweenParts, NOTABLE_GAP_M } from '@/payload/osm/assemble';
import { buildTrailFromOsm } from '@/payload/osm/build';
import {
  parseTrailGeometry,
  samePartsAs,
  toTrailGeometry,
} from '@/payload/osm/geometry';
import { measureParts } from '@/payload/osm/measure';

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

// The hook receives loosely typed form data; these keep the two branches
// readable without pretending to know more than we do about the shape.
type TrailData = Record<string, unknown>;
type HookArgs = Parameters<CollectionBeforeChangeHook>[0];

function nameOf(data: TrailData, originalDoc: TrailData | undefined): string {
  const fromData = data.displayName;
  if (typeof fromData === 'string' && fromData) {
    return fromData;
  }
  const fromDoc = originalDoc?.displayName;
  return typeof fromDoc === 'string' && fromDoc ? fromDoc : 'Trail';
}

export const resolveTrailGeometry: CollectionBeforeChangeHook = async (
  args,
) => {
  const { context, data, originalDoc } = args;

  // Bulk imports bring their own geometry and measurements. Without this, a
  // seed of a few hundred trails would fire one Overpass request each and get
  // the machine rate-limited long before it finished.
  if (context?.skipOsmRebuild) {
    return data;
  }

  // Trails whose geometry came from somewhere else (a Mapbox tileset, say) are
  // not maintained here, so leave what they arrived with alone.
  const source = data.geometrySource ?? originalDoc?.geometrySource;
  if (source === 'imported') {
    return data;
  }

  return source === 'edited'
    ? measureEditedGeometry(args)
    : rebuildFromOsmWays(args);
};

/**
 * Hand-edited geometry: keep the line, re-measure everything derived from it.
 *
 * No Overpass request happens here at all — the whole point of flipping a trail
 * to 'edited' is that the editor has overruled OSM for this one line, and
 * refetching would throw their work away on the next save.
 */
async function measureEditedGeometry({ data, originalDoc, req }: HookArgs) {
  const name = nameOf(data, originalDoc);
  // `in`, not `??`: a submitted null means the editor deleted every point, and
  // falling back to the stored line would make deleting a trail's line
  // impossible. Only an absent key means "this save didn't touch the geometry".
  const parsed = parseTrailGeometry(
    'geom' in data ? data.geom : originalDoc?.geom,
  );

  if (!parsed.ok) {
    // Collection `beforeChange` hooks run *before* field validation in Payload,
    // so the field's `validate` never sees a bad value that got this far — it
    // only ever sees whatever this hook returns. Quietly substituting the old
    // line here would therefore hide the problem completely: the save would
    // succeed, the editor's work would vanish, and nothing would say why.
    throw new ValidationError({
      collection: 'trails',
      errors: [{ message: parsed.error, path: 'geom' }],
      req,
    });
  }

  const parts = parsed.parts;

  if (parts.length === 0) {
    // Deleting every vertex clears the measurements too, rather than leaving a
    // distance attached to a trail that no longer has a line.
    return {
      ...data,
      bounds: null,
      distance: null,
      elevationGain: null,
      elevationLoss: null,
      elevationMax: null,
      elevationMin: null,
      elevationProfile: null,
      geom: null,
      osmReport: null,
      rebuildGeometry: false,
    };
  }

  const previous = parseTrailGeometry(originalDoc?.geom).parts ?? [];
  const geom = toTrailGeometry(parts);

  // Terrain sampling isn't free, and most saves of an edited trail change a
  // name or a rating rather than the line.
  if (
    samePartsAs(parts, previous) &&
    typeof originalDoc?.distance === 'number' &&
    data.rebuildGeometry !== true
  ) {
    return { ...data, geom, rebuildGeometry: false };
  }

  try {
    const measured = await measureParts(parts, name, {
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    });

    const gaps = gapsBetweenParts(parts);
    const warnings = [...measured.warnings];
    const notable = gaps.filter((gap) => gap.distanceMeters > NOTABLE_GAP_M);
    if (notable.length > 0) {
      warnings.push(
        `This line is in ${parts.length} disconnected pieces; the largest break is ${notable[0].distanceMeters} m. Drag an endpoint onto its neighbour to close it.`,
      );
    }

    return {
      ...data,
      bounds: measured.bounds,
      distance: measured.distance,
      elevationGain: measured.elevationGain,
      elevationLoss: measured.elevationLoss,
      elevationMax: measured.elevationMax,
      elevationMin: measured.elevationMin,
      // The chart the elevation pane draws. Sampling already happened to get
      // the totals above — throwing the per-point profile away meant a trail
      // created here had no chart at all, because the pane's only other source
      // is a static file that the checked-in trails ship with and a new one
      // never gets.
      elevationProfile: measured.profile,
      geom,
      osmReport: {
        builtAt: new Date().toISOString(),
        gaps,
        missingIds: [],
        // The ways this trail started from, kept so "revert to OSM" still knows
        // what to rebuild and the editor can see where the line came from.
        resolvedIds: readOsmIds(data.osmIds ?? originalDoc?.osmIds),
        source: 'edited',
        warnings,
      },
      rebuildGeometry: false,
    };
  } catch (error) {
    // Losing an edit because a terrain tile 500'd would be the worst possible
    // outcome here. Keep the line; the numbers refresh on the next save.
    const message = error instanceof Error ? error.message : String(error);
    req.payload.logger.error(
      `Trail "${name}": could not measure edited geometry — ${message}`,
    );
    return {
      ...data,
      geom,
      osmReport: {
        ...(typeof originalDoc?.osmReport === 'object'
          ? originalDoc.osmReport
          : {}),
        source: 'edited',
        warnings: [
          `The line was saved, but it could not be measured: ${message}. Save again to retry.`,
        ],
      },
      rebuildGeometry: false,
    };
  }
}

/** The default path: assemble the line from the OSM ways the trail references. */
async function rebuildFromOsmWays({
  data,
  operation,
  originalDoc,
  req,
}: HookArgs) {
  const osmIds = readOsmIds(data.osmIds);
  const previousIds = readOsmIds(originalDoc?.osmIds);

  if (osmIds.length === 0) {
    // Clearing the ways clears what was derived from them, rather than leaving
    // a stale line attached to a trail that no longer claims it.
    if (previousIds.length > 0) {
      return {
        ...data,
        bounds: null,
        elevationProfile: null,
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

  const name = nameOf(data, originalDoc);

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
      // See the note in the edited path: the pane's chart comes from here for
      // any trail that isn't in the checked-in data.
      elevationProfile: built.profile ?? data.elevationProfile,
      geom: built.geometry,
      osmIds,
      osmReport: {
        builtAt: new Date().toISOString(),
        gaps: built.report.gaps,
        missingIds: built.report.missingIds,
        resolvedIds: built.report.resolvedIds,
        source: 'osm',
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
        source: 'osm',
        warnings: [
          `Could not rebuild from OSM: ${message}. The previous geometry was kept — save again to retry.`,
        ],
      },
      rebuildGeometry: false,
    };
  }
}
