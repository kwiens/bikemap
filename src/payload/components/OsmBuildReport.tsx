'use client';

/**
 * Shows what the last OSM rebuild produced — warnings, gaps, and missing ways.
 *
 * Without this the failure modes of referencing OSM are invisible: a way gets
 * deleted upstream, the trail quietly gets shorter, and nobody notices until a
 * rider does. This is the admin-side equivalent of scripts/audit_bend_trails.py.
 */
import { useFormFields } from '@payloadcms/ui';
import { Banner } from './admin-ui';

interface Gap {
  distanceMeters: number;
  fromPart: number;
  toPart: number;
}

interface BuildReport {
  builtAt?: string | null;
  gaps?: Gap[];
  missingIds?: number[];
  resolvedIds?: number[];
  /** Which path produced the line — see resolveTrailGeometry. */
  source?: 'edited' | 'osm' | null;
  warnings?: string[];
}

export function OsmBuildReport({ path }: { path: string }) {
  const value = useFormFields(([fields]) => fields[path]?.value) as
    | BuildReport
    | string
    | null
    | undefined;

  const report: BuildReport | null =
    typeof value === 'string' ? safeParse(value) : (value ?? null);

  if (!report?.builtAt) {
    return (
      <div className="field-type">
        <p style={{ color: 'var(--theme-elevation-500)', margin: 0 }}>
          Not built yet — pick OSM ways and save.
        </p>
      </div>
    );
  }

  const warnings = report.warnings ?? [];
  const gaps = report.gaps ?? [];
  const healthy = warnings.length === 0 && gaps.length === 0;

  return (
    <div className="field-type">
      <p
        style={{
          color: 'var(--theme-elevation-500)',
          fontSize: '0.8rem',
          margin: '0 0 0.5rem',
        }}
      >
        {report.source === 'edited' ? (
          <>
            Measured {new Date(report.builtAt).toLocaleString()} from a line
            edited by hand — it no longer tracks OSM
          </>
        ) : (
          <>
            Built {new Date(report.builtAt).toLocaleString()} from{' '}
            {report.resolvedIds?.length ?? 0} OSM way
            {report.resolvedIds?.length === 1 ? '' : 's'}
          </>
        )}
        {healthy ? ' — no problems found.' : '.'}
      </p>

      {warnings.map((warning) => (
        <Banner key={warning} tone="warning">
          {warning}
        </Banner>
      ))}

      {gaps.length > 0 && (
        <p style={{ fontSize: '0.8rem', margin: 0 }}>
          Breaks between pieces:{' '}
          {gaps.map((gap) => `${gap.distanceMeters} m`).join(', ')}
        </p>
      )}
    </div>
  );
}

function safeParse(value: string): BuildReport | null {
  try {
    return JSON.parse(value) as BuildReport;
  } catch {
    return null;
  }
}
