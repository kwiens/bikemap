'use client';

import type { CSSProperties } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Button,
  toast,
  useDocumentInfo,
  useFormBackgroundProcessing,
  useFormFields,
  useFormModified,
  useFormProcessing,
} from '@payloadcms/ui';
import { RefreshCw } from 'lucide-react';
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
  value?: unknown;
}

interface MeasurementFormFields {
  bounds?: AdminFormField;
  distance?: AdminFormField;
  elevationGain?: AdminFormField;
  elevationLoss?: AdminFormField;
  elevationMax?: AdminFormField;
  elevationMin?: AdminFormField;
  elevationProfile?: AdminFormField;
  geom?: AdminFormField;
}

/**
 * The actionable form of a stored elevation profile.
 *
 * Raw point tuples remain hidden JSON; this field shows what a curator needs
 * to judge the result, and can rebuild it from the last saved geometry without
 * asking them to save unrelated form fields or run a script.
 */
export function ElevationProfileAdmin() {
  const {
    apiURL = '/api',
    data,
    hasSavePermission,
    id,
    incrementVersionCount,
    isEditing,
    setData,
    setLastUpdateTime,
  } = useDocumentInfo();
  const isModified = useFormModified();
  const isProcessing = useFormProcessing();
  const isBackgroundProcessing = useFormBackgroundProcessing();
  const isFormProcessing = isProcessing || isBackgroundProcessing;
  const boundsField = useAdminFormField('bounds');
  const distanceField = useAdminFormField('distance');
  const elevationGainField = useAdminFormField('elevationGain');
  const elevationLossField = useAdminFormField('elevationLoss');
  const elevationMaxField = useAdminFormField('elevationMax');
  const elevationMinField = useAdminFormField('elevationMin');
  const elevationProfileField = useAdminFormField('elevationProfile');
  const geometryField = useAdminFormField('geom');
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
      distance: distanceField,
      elevationGain: elevationGainField,
      elevationLoss: elevationLossField,
      elevationMax: elevationMaxField,
      elevationMin: elevationMinField,
      elevationProfile: elevationProfileField,
      geom: geometryField,
    }),
    [
      boundsField,
      distanceField,
      elevationGainField,
      elevationLossField,
      elevationMaxField,
      elevationMinField,
      elevationProfileField,
      geometryField,
    ],
  );
  const formSnapshot = useMemo(
    () => snapshotFromValues(formFields, data),
    [data, formFields],
  );
  const snapshot = result ?? formSnapshot;
  const geometry = fieldValue(formFields, data, 'geom');
  const parsedGeometry = parseTrailGeometry(geometry);
  const hasGeometry = parsedGeometry.ok && parsedGeometry.parts.length > 0;
  const canUpdateElevation =
    Boolean(id && isEditing) &&
    hasSavePermission !== false &&
    !isModified &&
    !isFormProcessing &&
    !isCalculating;

  async function handleUpdateElevation(): Promise<void> {
    if (!canUpdateElevation || id === undefined) {
      return;
    }

    setError(null);
    setIsCalculating(true);
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const response = await fetch(
        `${apiURL}/trails/${encodeURIComponent(String(id))}/recalculate-elevation`,
        {
          credentials: 'same-origin',
          method: 'POST',
          signal: controller.signal,
        },
      );
      const body: unknown = await response.json();

      if (controller.signal.aborted) {
        return;
      }

      if (!response.ok || !isRecalculation(body)) {
        throw new Error(messageFrom(body));
      }

      const next = snapshotFromResponse(body);
      setResult(next);
      updateFormFields(dispatchFields, next);
      setData({
        ...data,
        bounds: next.bounds,
        distance: next.distance,
        elevationGain: next.elevationGain,
        elevationLoss: next.elevationLoss,
        elevationMax: next.elevationMax,
        elevationMin: next.elevationMin,
        elevationProfile: next.profile,
        updatedAt: body.updatedAt,
      });
      setLastUpdateTime(Date.now());
      incrementVersionCount();
      toast.success(body.message);
    } catch (caught) {
      if (isAbortError(caught)) {
        return;
      }
      const message =
        caught instanceof Error
          ? caught.message
          : 'Elevation could not be updated.';
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
    isModified,
  });

  return (
    <section aria-labelledby="elevation-profile-heading" style={sectionStyle}>
      <div style={headingRowStyle}>
        <div>
          <h3 id="elevation-profile-heading" style={headingStyle}>
            Elevation profile
          </h3>
          <p style={descriptionStyle}>
            Terrain samples riders see on the map. Recalculate from a saved
            line, or repopulate a bundled profile when the line is style-owned.
          </p>
        </div>
        {snapshot.profile && (
          <span style={sampleCountStyle}>
            {snapshot.profile.profile.length.toLocaleString()} samples
          </span>
        )}
      </div>

      {snapshot.profile ? (
        <ProfileChart profile={snapshot.profile} />
      ) : (
        <Banner>
          {hasGeometry
            ? 'No elevation profile is stored yet. Recalculate to populate it from the saved line.'
            : 'No elevation profile is stored yet. Repopulate to restore the bundled profile for this trail.'}
        </Banner>
      )}

      <MeasurementSummary snapshot={snapshot} />

      {error && <Banner tone="error">{error}</Banner>}
      {unavailableReason && <Banner>{unavailableReason}</Banner>}

      <div style={actionRowStyle}>
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
            ? hasGeometry
              ? 'Calculating…'
              : 'Repopulating…'
            : hasGeometry
              ? 'Recalculate elevation'
              : 'Repopulate elevation'}
        </Button>
        <span style={actionHintStyle}>
          {hasGeometry
            ? 'Replaces the derived distance, climb, descent, range, bounds, and chart points.'
            : 'Restores the checked-in profile and its derived measurements without requiring CMS geometry.'}
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
    <figure style={figureStyle}>
      <svg
        aria-label={`Elevation profile for ${profile.trail}: ${range}`}
        preserveAspectRatio="none"
        role="img"
        style={chartStyle}
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
      <figcaption style={chartCaptionStyle}>
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
    <dl style={summaryStyle}>
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
    <div style={metricStyle}>
      <dt style={metricLabelStyle}>{label}</dt>
      <dd style={metricValueStyle}>{value}</dd>
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
): void {
  const values: Record<string, unknown> = {
    bounds: snapshot.bounds,
    distance: snapshot.distance,
    elevationGain: snapshot.elevationGain,
    elevationLoss: snapshot.elevationLoss,
    elevationMax: snapshot.elevationMax,
    elevationMin: snapshot.elevationMin,
    elevationProfile: snapshot.profile,
  };

  for (const [path, value] of Object.entries(values)) {
    dispatch({
      initialValue: value,
      modified: false,
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
      typeof candidate.updatedAt === 'string' &&
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
  return 'Elevation could not be updated.';
}

function actionUnavailableReason({
  hasSavePermission,
  id,
  isEditing,
  isFormProcessing,
  isModified,
}: {
  hasSavePermission: boolean | undefined;
  id: number | string | undefined;
  isEditing: boolean | undefined;
  isFormProcessing: boolean;
  isModified: boolean;
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
  if (isModified) {
    return 'Save the trail first so the profile follows the latest geometry.';
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

const sectionStyle: CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  marginTop: '1.5rem',
  overflow: 'hidden',
  padding: '1rem',
};

const headingRowStyle: CSSProperties = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: '1rem',
  justifyContent: 'space-between',
  marginBottom: '0.75rem',
};

const headingStyle: CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const descriptionStyle: CSSProperties = {
  color: 'var(--theme-elevation-600)',
  lineHeight: 1.45,
  margin: '0.25rem 0 0',
};

const sampleCountStyle: CSSProperties = {
  background: 'var(--theme-elevation-100)',
  borderRadius: '999px',
  color: 'var(--theme-elevation-650, var(--theme-elevation-600))',
  flexShrink: 0,
  fontSize: '0.75rem',
  padding: '0.25rem 0.55rem',
};

const figureStyle: CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
  margin: 0,
  overflow: 'hidden',
  padding: '0.5rem 0.5rem 0.35rem',
};

const chartStyle: CSSProperties = {
  display: 'block',
  height: 'clamp(9rem, 22vw, 13.75rem)',
  width: '100%',
};

const chartCaptionStyle: CSSProperties = {
  color: 'var(--theme-elevation-600)',
  display: 'flex',
  fontSize: '0.75rem',
  justifyContent: 'space-between',
  paddingTop: '0.25rem',
};

const summaryStyle: CSSProperties = {
  display: 'grid',
  gap: '1px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  margin: '0.75rem 0',
  overflow: 'hidden',
};

const metricStyle: CSSProperties = {
  background: 'var(--theme-elevation-50)',
  minWidth: 0,
  padding: '0.65rem 0.75rem',
};

const metricLabelStyle: CSSProperties = {
  color: 'var(--theme-elevation-600)',
  fontSize: '0.75rem',
  lineHeight: 1.2,
  marginBottom: '0.2rem',
};

const metricValueStyle: CSSProperties = {
  fontSize: '1rem',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const actionRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.65rem 1rem',
  marginTop: '0.75rem',
};

const actionHintStyle: CSSProperties = {
  color: 'var(--theme-elevation-600)',
  fontSize: '0.8rem',
  lineHeight: 1.4,
};
