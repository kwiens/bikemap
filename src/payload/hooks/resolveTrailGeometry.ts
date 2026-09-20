/**
 * Keeps a trail's line and its measurements in step, on save.
 *
 * Geometry reaches a trail two ways, and this hook owns both:
 *
 *   osm      the editor previews a line built from the referenced OSM ways.
 *            Saving validates that the preview matches those ids and measures
 *            that exact reviewed line without another Overpass request.
 *   edited   the line was adjusted by hand in the geometry editor. It is left
 *            exactly as drawn, but distance, elevation, and bounds are
 *            re-measured from it so they never drift from the line on screen.
 *
 * ('imported' is the third case — geometry that came from somewhere else
 * entirely, such as an archived GIS snapshot. It is left completely alone.)
 *
 * Both paths are server-authoritative for measurements: the admin supplies the
 * reviewed line, but every derived number is computed here, never accepted
 * from the client.
 */
import { ValidationError, type CollectionBeforeChangeHook } from 'payload';
import { isCityId } from '@/config/map.config';
import { gapsBetweenParts, NOTABLE_GAP_M } from '@/payload/osm/assemble';
import {
  parseTrailGeometry,
  samePartsAs,
  toTrailGeometry,
} from '@/payload/osm/geometry';
import { parseOsmIds } from '@/payload/osm/ids';
import { measureParts } from '@/payload/osm/measure';
import { getBundledElevationProfile } from '@/payload/read/bundled-elevation';
import { measurementsFromElevationProfile } from '@/utils/elevation-profile';

/** Reads an osmIds value that may arrive as an array, a JSON string, or null. */
function readOsmIds(value: unknown): number[] {
  const parsed = parseOsmIds(value);
  return parsed.ok ? parsed.ids : [];
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

/**
 * The line and everything measured from it, emptied together.
 *
 * Geometry and its measurements move as one unit in both directions: a trail
 * never carries a distance or a chart for a line it no longer has, and never a
 * line whose numbers were cleared out from under it.
 */
const CLEARED_GEOMETRY = {
  bounds: null,
  distance: null,
  elevationGain: null,
  elevationLoss: null,
  elevationMax: null,
  elevationMin: null,
  elevationProfile: null,
  geom: null,
  osmReport: null,
  rebuildElevation: false,
  rebuildGeometry: false,
};

/**
 * What the trail already had on record.
 *
 * These fields are computed here and never accepted from the client, so a save
 * that doesn't recompute them restores the stored values rather than letting a
 * submitted `distance` or `geom` through.
 */
function storedGeometry(originalDoc: TrailData | undefined) {
  return {
    bounds: originalDoc?.bounds ?? null,
    distance: originalDoc?.distance ?? null,
    elevationGain: originalDoc?.elevationGain ?? null,
    elevationLoss: originalDoc?.elevationLoss ?? null,
    elevationMax: originalDoc?.elevationMax ?? null,
    elevationMin: originalDoc?.elevationMin ?? null,
    elevationProfile: originalDoc?.elevationProfile ?? null,
    geom: originalDoc?.geom ?? null,
    osmReport: originalDoc?.osmReport ?? null,
  };
}

export const resolveTrailGeometry: CollectionBeforeChangeHook = async (
  args,
) => {
  const { context, data, originalDoc, req } = args;

  // Payload runs collection hooks before field validation. Validate here too,
  // or a mixed valid/invalid list would be silently filtered before the field
  // validator ever saw it — and an entirely invalid list would clear the line.
  if ('osmIds' in data) {
    const parsed = parseOsmIds(data.osmIds);
    if (!parsed.ok) {
      throw new ValidationError({
        collection: 'trails',
        errors: [{ message: parsed.error, path: 'osmIds' }],
        req,
      });
    }
    data.osmIds = parsed.ids;
  }

  // Bulk imports bring their own geometry and measurements. Without this, a
  // seed of a few hundred trails would fire one Overpass request each and get
  // the machine rate-limited long before it finished.
  if (context?.skipOsmRebuild) {
    return data;
  }

  // Trails whose geometry came from somewhere else (a GIS import, say) are
  // not maintained here, so leave what they arrived with alone.
  const source = data.geometrySource ?? originalDoc?.geometrySource;
  if (source === 'imported') {
    return data.rebuildElevation === true
      ? refreshElevationFromCurrentLine(args)
      : data;
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
    return { ...data, ...CLEARED_GEOMETRY };
  }

  const previous = parseTrailGeometry(originalDoc?.geom).parts ?? [];
  const geom = toTrailGeometry(parts);

  // Terrain sampling isn't free, and most saves of an edited trail change a
  // name or a rating rather than the line.
  if (
    samePartsAs(parts, previous) &&
    typeof originalDoc?.distance === 'number' &&
    data.rebuildGeometry !== true &&
    data.rebuildElevation !== true
  ) {
    // The stored measurements still describe this line — the submitted ones are
    // client input and carry no authority, so they don't survive the save. The
    // line itself is the editor's to author; it is kept in its parsed form.
    return {
      ...data,
      ...storedGeometry(originalDoc),
      geom,
      rebuildElevation: false,
      rebuildGeometry: false,
    };
  }

  try {
    const measured = await measureParts(parts, name, {
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    });
    if (data.rebuildElevation === true && !measured.profile) {
      throw new Error(
        measured.warnings[0] ?? 'No elevation samples were returned.',
      );
    }

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
      rebuildElevation: false,
      rebuildGeometry: false,
    };
  } catch (error) {
    // Losing an edit because a terrain tile 500'd would be the worst possible
    // outcome here. Keep the line; the numbers refresh on the next save.
    const message = error instanceof Error ? error.message : String(error);
    if (data.rebuildElevation === true) {
      throw elevationValidationError(message, req);
    }
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
      rebuildElevation: false,
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
  // `in`, not `??`: a submitted empty list means the editor removed every way,
  // while an absent key means this save never touched them — a partial update
  // that only flips `_status` must not read as "clear the ways".
  const osmIds = readOsmIds(
    'osmIds' in data ? data.osmIds : originalDoc?.osmIds,
  );
  const previousIds = readOsmIds(originalDoc?.osmIds);

  if (osmIds.length === 0) {
    // Clearing the ways clears what was derived from them, rather than leaving
    // a stale line attached to a trail that no longer claims it. A trail that
    // never had ways has nothing to clear, but it has no line either, so it
    // cannot carry measurements — an 'imported' trail, whose geometry is
    // maintained elsewhere, has already returned before this point.
    return { ...data, ...CLEARED_GEOMETRY };
  }

  // The admin's refresh action already fetched and displayed this exact line.
  // Saving must keep the reviewed preview, not make a second Overpass request
  // that could return a different revision or fail after the curator approved
  // what was on screen. Measurements are still recomputed server-side.
  if (data.rebuildGeometry === true && isOsmPreviewReport(data.osmReport)) {
    return saveOsmPreview({ data, originalDoc, req }, osmIds);
  }

  if (
    operation === 'update' &&
    sameIds(osmIds, previousIds) &&
    Boolean(originalDoc?.geom) &&
    data.rebuildElevation === true &&
    data.rebuildGeometry !== true
  ) {
    return refreshElevationFromCurrentLine({ data, originalDoc, req });
  }

  // A routine save never contacts Overpass. Curators first build a preview,
  // inspect it on the map, and then save that exact reviewed line.
  const unchanged =
    operation === 'update' &&
    sameIds(osmIds, previousIds) &&
    Boolean(originalDoc?.geom) &&
    data.rebuildGeometry !== true;

  if (unchanged) {
    // Nothing was rebuilt, so nothing derived may change: the line and its
    // measurements come back off the stored document, not out of the request.
    return {
      ...data,
      ...storedGeometry(originalDoc),
      rebuildElevation: false,
      rebuildGeometry: false,
    };
  }

  throw new ValidationError({
    collection: 'trails',
    errors: [
      {
        message:
          'Refresh the selected OpenStreetMap ways and review the preview before saving.',
        path: 'geom',
      },
    ],
    req,
  });
}

async function saveOsmPreview(
  { data, originalDoc, req }: Pick<HookArgs, 'data' | 'originalDoc' | 'req'>,
  osmIds: number[],
) {
  const parsed = parseTrailGeometry(data.geom);
  if (!parsed.ok || parsed.parts.length === 0) {
    throw new ValidationError({
      collection: 'trails',
      errors: [
        {
          message: parsed.ok
            ? 'Refresh the OpenStreetMap line again before saving.'
            : parsed.error,
          path: 'geom',
        },
      ],
      req,
    });
  }

  const measured = await measureParts(parsed.parts, nameOf(data, originalDoc), {
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });
  if (data.rebuildElevation === true && !measured.profile) {
    throw elevationValidationError(
      measured.warnings[0] ?? 'No elevation samples were returned.',
      req,
    );
  }
  const report = previewReport(data.osmReport);
  const reportedIds = [...report.resolvedIds, ...report.missingIds];
  if (!sameIdSet(osmIds, reportedIds)) {
    throw new ValidationError({
      collection: 'trails',
      errors: [
        {
          message:
            'The selected OpenStreetMap ways changed after this preview. Refresh the line again before saving.',
          path: 'geom',
        },
      ],
      req,
    });
  }
  const gaps = gapsBetweenParts(parsed.parts);
  const warnings = [...new Set([...report.warnings, ...measured.warnings])];

  return {
    ...data,
    bounds: measured.bounds,
    distance: measured.distance,
    elevationGain: measured.elevationGain,
    elevationLoss: measured.elevationLoss,
    elevationMax: measured.elevationMax,
    elevationMin: measured.elevationMin,
    elevationProfile: measured.profile,
    geom: toTrailGeometry(parsed.parts),
    osmIds,
    osmReport: {
      builtAt: new Date().toISOString(),
      gaps,
      missingIds: report.missingIds,
      resolvedIds: report.resolvedIds,
      source: 'osm',
      warnings,
    },
    rebuildElevation: false,
    rebuildGeometry: false,
  };
}

function isOsmPreviewReport(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    'isPreview' in value &&
    value.isPreview === true
  );
}

function previewReport(value: unknown): {
  missingIds: number[];
  resolvedIds: number[];
  warnings: string[];
} {
  if (!value || typeof value !== 'object') {
    return { missingIds: [], resolvedIds: [], warnings: [] };
  }
  const report = value as {
    missingIds?: unknown;
    resolvedIds?: unknown;
    warnings?: unknown;
  };
  return {
    missingIds: validOsmIds(report.missingIds),
    resolvedIds: validOsmIds(report.resolvedIds),
    warnings: Array.isArray(report.warnings)
      ? report.warnings.filter(
          (warning): warning is string => typeof warning === 'string',
        )
      : [],
  };
}

function validOsmIds(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (id): id is number =>
          typeof id === 'number' && Number.isInteger(id) && id > 0,
      )
    : [];
}

function sameIdSet(a: number[], b: number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Re-samples the current line while leaving its source and coordinates alone. */
async function refreshElevationFromCurrentLine({
  data,
  originalDoc,
  req,
}: Pick<HookArgs, 'data' | 'originalDoc' | 'req'>) {
  const geometry = 'geom' in data ? data.geom : originalDoc?.geom;
  const parsed = parseTrailGeometry(geometry);
  if (!parsed.ok) {
    throw new ValidationError({
      collection: 'trails',
      errors: [{ message: parsed.error, path: 'geom' }],
      req,
    });
  }

  if (parsed.parts.length === 0) {
    const city = data.city ?? originalDoc?.city;
    const slug = data.slug ?? originalDoc?.slug;
    const bundled =
      isCityId(city) && typeof slug === 'string'
        ? await getBundledElevationProfile(city, slug)
        : null;
    if (!bundled) {
      throw elevationValidationError(
        'This trail has no line or bundled elevation profile to save.',
        req,
      );
    }

    return {
      ...data,
      ...measurementsFromElevationProfile(bundled),
      elevationProfile: bundled,
      rebuildElevation: false,
      rebuildGeometry: false,
    };
  }

  const measured = await measureParts(parsed.parts, nameOf(data, originalDoc), {
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });
  if (
    !measured.profile ||
    measured.elevationGain === null ||
    measured.elevationLoss === null ||
    measured.elevationMax === null ||
    measured.elevationMin === null
  ) {
    throw elevationValidationError(
      measured.warnings[0] ?? 'No elevation samples were returned.',
      req,
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
    elevationProfile: measured.profile,
    geom: toTrailGeometry(parsed.parts),
    rebuildElevation: false,
    rebuildGeometry: false,
  };
}

function elevationValidationError(message: string, req: HookArgs['req']) {
  return new ValidationError({
    collection: 'trails',
    errors: [{ message, path: 'elevationProfileAdmin' }],
    req,
  });
}
