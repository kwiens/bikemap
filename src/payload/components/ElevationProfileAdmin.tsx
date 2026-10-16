'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Button,
  toast,
  useConfig,
  useDocumentInfo,
  useFormBackgroundProcessing,
  useFormFields,
  useFormProcessing,
} from '@payloadcms/ui';
import { RefreshCw } from 'lucide-react';
import { formatAdminURL } from 'payload/shared';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import type { RecalculateTrailElevationResponse } from '@/payload/endpoints/recalculate-trail-elevation';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { parseElevationProfile } from '@/utils/elevation-profile';
import { Banner } from './admin-ui';

interface MeasurementSnapshot {
  bounds: [number, number, number, number] | null;
  distance: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  elevationMax: number | null;
  elevationMin: number | null;
  profile: ElevationProfile | null;
}

interface ChartPaths {
  area: string;
  line: string;
}

interface ApiError {
  message?: unknown;
}

interface AdminFormField {
  initialValue?: unknown;
  value?: unknown;
}

interface MeasurementFormFields {
  bounds?: AdminFormField;
  city?: AdminFormField;
  distance?: AdminFormField;
  elevationGain?: AdminFormField;
  elevationLoss?: AdminFormField;
  elevationMax?: AdminFormField;
  elevationMin?: AdminFormField;
  elevationProfile?: AdminFormField;
  geom?: AdminFormField;
  geometrySource?: AdminFormField;
  rebuildElevation?: AdminFormField;
  rebuildGeometry?: AdminFormField;
  slug?: AdminFormField;
  trailName?: AdminFormField;
  displayName?: AdminFormField;
}

/**
 * The actionable form of a stored elevation profile.
 *
 * Raw point tuples remain hidden JSON; this field shows what a curator needs
 * to judge the result. Calculation updates the open form so the chart can be
 * reviewed before the normal Save draft or Publish action persists it.
 */
export function ElevationProfileAdmin() {
  const { data, hasSavePermission, id, isEditing } = useDocumentInfo();
  const {
    config: {
      routes: { api: apiRoute },
      serverURL,
    },
  } = useConfig();
  const isProcessing = useFormProcessing();
  const isBackgroundProcessing = useFormBackgroundProcessing();
  const isFormProcessing = isProcessing || isBackgroundProcessing;
  const boundsField = useAdminFormField('bounds');
  const cityField = useAdminFormField('city');
  const distanceField = useAdminFormField('distance');
  const elevationGainField = useAdminFormField('elevationGain');
  const elevationLossField = useAdminFormField('elevationLoss');
  const elevationMaxField = useAdminFormField('elevationMax');
  const elevationMinField = useAdminFormField('elevationMin');
  const elevationProfileField = useAdminFormField('elevationProfile');
  const geometryField = useAdminFormField('geom');
  const geometrySourceField = useAdminFormField('geometrySource');
  const rebuildElevationField = useAdminFormField('rebuildElevation');
  const rebuildGeometryField = useAdminFormField('rebuildGeometry');
  const slugField = useAdminFormField('slug');
  const displayNameField = useAdminFormField('displayName');
  const trailNameField = useAdminFormField('trailName');
  const dispatchFields = useFormFields(([, dispatch]) => dispatch);
  const [result, setResult] = useState<MeasurementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  // Payload keeps this component mounted across ordinary saves and sometimes
  // across record navigation. A newer saved document supersedes the optimistic
  // endpoint result. Abort the old document's request too, or a late response
  // could put trail A's measurements into trail B's open form.
  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setResult(null);
    setError(null);
    setIsCalculating(false);

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [data?.updatedAt, id]);

  const formFields = useMemo<MeasurementFormFields>(
    () => ({
      bounds: boundsField,
      city: cityField,
      distance: distanceField,
      elevationGain: elevationGainField,
      elevationLoss: elevationLossField,
      elevationMax: elevationMaxField,
      elevationMin: elevationMinField,
      elevationProfile: elevationProfileField,
      geom: geometryField,
      geometrySource: geometrySourceField,
      rebuildElevation: rebuildElevationField,
      rebuildGeometry: rebuildGeometryField,
      slug: slugField,
      displayName: displayNameField,
      trailName: trailNameField,
    }),
    [
      boundsField,
      cityField,
      distanceField,
      elevationGainField,
      elevationLossField,
      elevationMaxField,
      elevationMinField,
      elevationProfileField,
      geometryField,
      geometrySourceField,
      rebuildElevationField,
      rebuildGeometryField,
      slugField,
      displayNameField,
      trailNameField,
    ],
  );
  const formSnapshot = useMemo(
    () => snapshotFromValues(formFields, data),
    [data, formFields],
  );
  const snapshot = result ?? formSnapshot;
  const isPreview =
    result !== null ||
    fieldValue(formFields, data, 'rebuildElevation') === true ||
    fieldValue(formFields, data, 'rebuildGeometry') === true;
  const geometry = fieldValue(formFields, data, 'geom');
  const city = fieldValue(formFields, data, 'city');
  const slug = fieldValue(formFields, data, 'slug');
  const calculationName =
    fieldValue(formFields, data, 'displayName') ??
    fieldValue(formFields, data, 'trailName');
  const calculationSourceKey = useMemo(
    () => JSON.stringify([geometry, calculationName, city, slug]),
    [calculationName, city, geometry, slug],
  );
  const parsedGeometry = parseTrailGeometry(geometry);
  const hasGeometry = parsedGeometry.ok && parsedGeometry.parts.length > 0;
  const geometrySource = fieldValue(formFields, data, 'geometrySource');
  const canImportBundledProfile = !hasGeometry && geometrySource === 'imported';
  const hasElevationSource = hasGeometry || canImportBundledProfile;
  const canUpdateElevation =
    Boolean(id && isEditing) &&
    hasSavePermission !== false &&
    hasElevationSource &&
    !isFormProcessing &&
    !isCalculating;

  // A result belongs to the exact line and name sent to the server. Abort and
  // discard it when another editor field changes either value, or a late
  // response could display measurements for a line that is no longer open.
  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setResult(null);
    setError(null);
    setIsCalculating(false);
  }, [calculationSourceKey]);

  async function handleUpdateElevation(): Promise<void> {
    if (!canUpdateElevation || id === undefined) {
      return;
    }

    setError(null);
    setIsCalculating(true);
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const endpoint = formatAdminURL({
        apiRoute,
        path: `/trails/${encodeURIComponent(String(id))}/recalculate-elevation`,
        serverURL,
      });
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          city,
          geometry,
          name: calculationName,
          slug,
        }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });
      const body: unknown = await response.json();

      if (controller.signal.aborted) {
        return;
      }

      if (!response.ok || !isRecalculation(body)) {
        throw new Error(messageFrom(body));
      }

      const next = snapshotFromResponse(body);
      setResult(next);
      updateFormFields(dispatchFields, next, formFields, data);
      toast.success(body.message);
    } catch (caught) {
      if (isAbortError(caught)) {
        return;
      }
      const message =
        caught instanceof Error
          ? caught.message
          : 'Elevation could not be calculated.';
      setError(message);
      toast.error(message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsCalculating(false);
      }
    }
  }

  const unavailableReason = actionUnavailableReason({
    hasSavePermission,
    id,
    isEditing,
    isFormProcessing,
    hasElevationSource,
  });

  return (
    <section
      aria-labelledby="elevation-profile-heading"
      className="mt-6 overflow-hidden rounded-[var(--style-radius-m)] border border-solid border-[color:var(--theme-elevation-150)] p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3
            className="m-0 text-base font-semibold leading-tight"
            id="elevation-profile-heading"
          >
            Elevation profile
          </h3>
          <p className="mb-0 mt-1 text-[color:var(--theme-elevation-600)] leading-[1.45]">
            Terrain samples riders see on the map. Recalculate from topo
            elevations along the track.
          </p>
        </div>
        {snapshot.profile && (
          <span className="shrink-0 rounded-full bg-[var(--theme-elevation-100)] px-[0.55rem] py-1 text-xs text-[color:var(--theme-elevation-650,var(--theme-elevation-600))]">
            {isPreview ? 'Unsaved preview' : 'Stored with trail'} ·{' '}
            {snapshot.profile.profile.length.toLocaleString()} samples
          </span>
        )}
      </div>

      {snapshot.profile ? (
        <ProfileChart profile={snapshot.profile} />
      ) : (
        <Banner>
          {hasGeometry
            ? 'No elevation profile is stored yet. Calculate it below, review the preview, then save the trail if it looks right.'
            : canImportBundledProfile
              ? 'No elevation profile is stored with this trail yet. Preview the bundled rider profile below, then save the trail if it looks right.'
              : 'No elevation profile is stored yet. Add a trail line first, then calculate its elevation.'}
        </Banner>
      )}

      <MeasurementSummary snapshot={snapshot} />

      {error && <Banner tone="error">{error}</Banner>}
      {unavailableReason && <Banner>{unavailableReason}</Banner>}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-[0.65rem]">
        <Button
          buttonStyle="primary"
          disabled={!canUpdateElevation}
          icon={<RefreshCw aria-hidden size={16} />}
          margin={false}
          onClick={() => void handleUpdateElevation()}
          size="small"
          type="button"
        >
          {isCalculating
            ? canImportBundledProfile
              ? 'Loading preview…'
              : 'Calculating…'
            : canImportBundledProfile
              ? 'Preview bundled profile'
              : 'Calculate elevation'}
        </Button>
        <span className="text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.4]">
          {canImportBundledProfile
            ? 'This loads the bundled profile into the form without saving it. Review it, then use Save draft or Publish to keep it.'
            : 'This replaces the distance, climb, descent, range, bounds, and chart points in the form without saving. Review the result, then use Save draft or Publish to keep it.'}
        </span>
      </div>
    </section>
  );
}

/**
 * Suppresses raw derived controls on the edit form without hiding their list
 * columns or removing their values from Payload's form state.
 */
export function DerivedMeasurementField() {
  return null;
}

function ProfileChart({ profile }: { profile: ElevationProfile }) {
  const gradientId = `elevation-fill-${useId().replaceAll(':', '')}`;
  const paths = useMemo(() => buildChartPaths(profile), [profile]);
  const range = `${formatFeet(profile.min)}–${formatFeet(profile.max)}`;

  return (
    <figure className="m-0 overflow-hidden rounded-[var(--style-radius-s)] border border-solid border-[color:var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] px-2 pb-[0.35rem] pt-2">
      <svg
        aria-label={`Elevation profile for ${profile.trail}: ${range}`}
        className="block h-[clamp(9rem,22vw,13.75rem)] w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--theme-success-500, #2f7d59)"
              stopOpacity="0.42"
            />
            <stop
              offset="100%"
              stopColor="var(--theme-success-500, #2f7d59)"
              stopOpacity="0.06"
            />
          </linearGradient>
        </defs>
        {CHART_GRID_LINES.map((fraction) => (
          <line
            key={fraction}
            stroke="var(--theme-elevation-150)"
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={CHART_WIDTH}
            y1={fraction * CHART_HEIGHT}
            y2={fraction * CHART_HEIGHT}
          />
        ))}
        <path d={paths.area} fill={`url(#${gradientId})`} />
        <path
          d={paths.line}
          fill="none"
          stroke="var(--theme-success-600, #276749)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between pt-1 text-xs text-[color:var(--theme-elevation-600)]">
        <span>0 mi</span>
        <span>{formatMiles(profile.distance / FEET_PER_MILE)}</span>
      </figcaption>
    </figure>
  );
}

function MeasurementSummary({ snapshot }: { snapshot: MeasurementSnapshot }) {
  const range =
    snapshot.elevationMin === null || snapshot.elevationMax === null
      ? '—'
      : `${formatFeet(snapshot.elevationMin)}–${formatFeet(snapshot.elevationMax)}`;

  return (
    <dl className="my-3 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-px overflow-hidden">
      <Metric
        label="Distance"
        value={
          snapshot.distance === null ? '—' : formatMiles(snapshot.distance)
        }
      />
      <Metric
        label="Climb"
        value={formatOptionalFeet(snapshot.elevationGain)}
      />
      <Metric
        label="Descent"
        value={formatOptionalFeet(snapshot.elevationLoss)}
      />
      <Metric label="Elevation range" value={range} />
    </dl>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[var(--theme-elevation-50)] px-3 py-[0.65rem]">
      <dt className="mb-[0.2rem] text-xs text-[color:var(--theme-elevation-600)] leading-[1.2]">
        {label}
      </dt>
      <dd className="m-0 text-base font-semibold leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** Produces one line and one closed fill path, split at geometry gaps. */
export function buildChartPaths(profile: ElevationProfile): ChartPaths {
  const points: ElevationProfile['profile'] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  // One bounded pass over the stored sample count; malformed points are
  // skipped defensively even though the JSON boundary validates them first.
  for (const point of profile.profile) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue;
    }
    points.push(point);
    min = Math.min(min, point[1]);
    max = Math.max(max, point[1]);
  }
  if (points.length === 0) {
    return { area: '', line: '' };
  }

  const maxDistance = Math.max(points[points.length - 1][0], 1);
  const elevationRange = max - min || 1;
  const x = (distance: number) => (distance / maxDistance) * CHART_WIDTH;
  const y = (elevation: number) =>
    CHART_PADDING +
    (1 - (elevation - min) / elevationRange) *
      (CHART_HEIGHT - CHART_PADDING * 2);
  const ranges = segmentRanges(points, profile.geometryGapDetails);

  const segments = ranges.map(([start, end]) => ({
    end,
    path: pathThrough(points, start, end, x, y),
    start,
  }));
  const line = segments.map(({ path }) => path).join(' ');
  const area = segments
    .map(({ end, path, start }) => {
      return `${path} L${coordinate(x(points[end - 1][0]))} ${CHART_HEIGHT} L${coordinate(x(points[start][0]))} ${CHART_HEIGHT} Z`;
    })
    .join(' ');

  return { area, line };
}

function pathThrough(
  points: ElevationProfile['profile'],
  start: number,
  end: number,
  x: (distance: number) => number,
  y: (elevation: number) => number,
): string {
  return points
    .slice(start, end)
    .map(
      ([distance, elevation], index) =>
        `${index === 0 ? 'M' : 'L'}${coordinate(x(distance))} ${coordinate(y(elevation))}`,
    )
    .join(' ');
}

function segmentRanges(
  points: ElevationProfile['profile'],
  gaps: ElevationProfile['geometryGapDetails'] = [],
): [number, number][] {
  const gapEdges = new Set(
    gaps.map(({ from, to }) => `${from[0]},${from[1]}:${to[0]},${to[1]}`),
  );
  const starts = [0];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const edge = `${previous[2]},${previous[3]}:${current[2]},${current[3]}`;
    if (current[0] <= previous[0] || gapEdges.has(edge)) {
      starts.push(index);
    }
  }
  starts.push(points.length);
  return starts.slice(0, -1).map((start, index) => [start, starts[index + 1]]);
}

function snapshotFromValues(
  fields: MeasurementFormFields,
  data: Record<string, unknown> | undefined,
): MeasurementSnapshot {
  return {
    bounds: readBounds(fieldValue(fields, data, 'bounds')),
    distance: readNumber(fieldValue(fields, data, 'distance')),
    elevationGain: readNumber(fieldValue(fields, data, 'elevationGain')),
    elevationLoss: readNumber(fieldValue(fields, data, 'elevationLoss')),
    elevationMax: readNumber(fieldValue(fields, data, 'elevationMax')),
    elevationMin: readNumber(fieldValue(fields, data, 'elevationMin')),
    profile: parseElevationProfile(
      fieldValue(fields, data, 'elevationProfile'),
    ),
  };
}

function snapshotFromResponse(
  body: RecalculateTrailElevationResponse,
): MeasurementSnapshot {
  return {
    ...body.measurements,
    profile: body.profile,
  };
}

function fieldValue(
  fields: MeasurementFormFields,
  data: Record<string, unknown> | undefined,
  path: keyof MeasurementFormFields,
): unknown {
  // Payload omits `admin.hidden` fields from form state. The stored elevation
  // profile is one of those fields, so fall back to the document data when no
  // form field is registered; otherwise an existing chart would appear empty.
  const field = fields[path];
  return field === undefined ? data?.[path] : field.value;
}

function updateFormFields(
  dispatch: (action: {
    initialValue: unknown;
    modified: boolean;
    path: string;
    type: 'UPDATE';
    value: unknown;
  }) => void,
  snapshot: MeasurementSnapshot,
  fields: MeasurementFormFields,
  data: Record<string, unknown> | undefined,
): void {
  const values: Record<string, unknown> = {
    bounds: snapshot.bounds,
    distance: snapshot.distance,
    elevationGain: snapshot.elevationGain,
    elevationLoss: snapshot.elevationLoss,
    elevationMax: snapshot.elevationMax,
    elevationMin: snapshot.elevationMin,
    elevationProfile: snapshot.profile,
    rebuildElevation: true,
  };

  for (const [path, value] of Object.entries(values)) {
    const fieldPath = path as keyof MeasurementFormFields;
    dispatch({
      initialValue:
        fields[fieldPath]?.initialValue ?? fieldValue(fields, data, fieldPath),
      modified: true,
      path,
      type: 'UPDATE',
      value,
    });
  }
}

function readBounds(value: unknown): [number, number, number, number] | null {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
    ? (value as [number, number, number, number])
    : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function useAdminFormField(path: string): AdminFormField | undefined {
  return useFormFields(([fields]) => fields[path]);
}

function isAbortError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function isRecalculation(
  body: unknown,
): body is RecalculateTrailElevationResponse {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as Partial<RecalculateTrailElevationResponse>;
  const measurements = candidate.measurements;
  return Boolean(
    typeof candidate.message === 'string' &&
      parseElevationProfile(candidate.profile) &&
      measurements &&
      readBounds(measurements.bounds) === measurements.bounds &&
      readNumber(measurements.distance) !== null &&
      readNumber(measurements.elevationGain) !== null &&
      readNumber(measurements.elevationLoss) !== null &&
      readNumber(measurements.elevationMax) !== null &&
      readNumber(measurements.elevationMin) !== null,
  );
}

function messageFrom(body: unknown): string {
  if (body !== null && typeof body === 'object') {
    const message = (body as ApiError).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Elevation could not be calculated.';
}

function actionUnavailableReason({
  hasSavePermission,
  id,
  isEditing,
  isFormProcessing,
  hasElevationSource,
}: {
  hasSavePermission: boolean | undefined;
  id: number | string | undefined;
  isEditing: boolean | undefined;
  isFormProcessing: boolean;
  hasElevationSource: boolean;
}): string | null {
  if (!id || !isEditing) {
    return 'Save this trail once before calculating its elevation.';
  }
  if (hasSavePermission === false) {
    return 'You do not have permission to update this trail.';
  }
  if (isFormProcessing) {
    return 'Wait for the current save to finish before recalculating.';
  }
  if (!hasElevationSource) {
    return 'Add a trail line first, then calculate its elevation here.';
  }
  return null;
}

function formatOptionalFeet(value: number | null): string {
  return value === null ? '—' : formatFeet(value);
}

function formatFeet(value: number): string {
  return `${Math.round(value).toLocaleString()} ft`;
}

function formatMiles(value: number): string {
  return `${value.toFixed(2)} mi`;
}

function coordinate(value: number): string {
  return value.toFixed(1);
}

const FEET_PER_MILE = 5280;
const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const CHART_PADDING = 12;
const CHART_GRID_LINES = [0.25, 0.5, 0.75] as const;
