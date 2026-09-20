'use client';

/**
 * Shows what the last OSM rebuild produced — warnings, gaps, and missing ways.
 *
 * Without this the failure modes of referencing OSM are invisible: a way gets
 * deleted upstream, the trail quietly gets shorter, and nobody notices until a
 * rider does. This is the admin-side equivalent of scripts/audit_bend_trails.py.
 */
import { useId } from 'react';
import { useFormFields } from '@payloadcms/ui';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { parseOsmIds } from '@/payload/osm/ids';
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
  isPreview?: boolean;
  warnings?: string[];
}

export function OsmBuildReport({ path }: { path: string }) {
  const headingId = `saved-trail-line-${useId().replaceAll(':', '')}`;
  const value = useFormFields(([fields]) => fields[path]?.value) as
    | BuildReport
    | string
    | null
    | undefined;
  const geometry = useFormFields(([fields]) => fields.geom?.value);
  const osmIds = useFormFields(([fields]) => fields.osmIds?.value);
  const geometrySource = useFormFields(
    ([fields]) => fields.geometrySource?.value,
  );

  const report: BuildReport | null =
    typeof value === 'string' ? safeParse(value) : (value ?? null);
  const parsedGeometry = parseTrailGeometry(geometry);
  const hasStoredLine = parsedGeometry.ok && parsedGeometry.parts.length > 0;
  const parsedIds = parseOsmIds(osmIds);
  const wayCount = parsedIds.ok ? parsedIds.ids.length : 0;
  const source = typeof geometrySource === 'string' ? geometrySource : 'osm';
  const status = buildStatus(report, source, hasStoredLine, wayCount);

  const warnings = report?.warnings ?? [];
  const gaps = report?.gaps ?? [];
  const healthy = warnings.length === 0 && gaps.length === 0;

  return (
    <section
      aria-labelledby={headingId}
      className="field-type mt-6 border-0 border-t border-solid border-[color:var(--theme-elevation-150)] pt-4"
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            className="m-0 text-sm font-semibold leading-tight"
            id={headingId}
          >
            Trail line status
          </h3>
          <p className="mb-0 mt-1 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.45]">
            {status.description}
            {report?.builtAt && healthy ? ' No problems found.' : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--theme-elevation-100)] px-[0.55rem] py-1 text-xs text-[color:var(--theme-elevation-650,var(--theme-elevation-600))]">
          {status.label}
        </span>
      </div>

      {warnings.map((warning) => (
        <Banner key={warning} tone="warning">
          {warning}
        </Banner>
      ))}

      {gaps.length > 0 && (
        <p className="m-0 text-[0.8rem]">
          Breaks between pieces:{' '}
          {gaps.map((gap) => `${gap.distanceMeters} m`).join(', ')}
        </p>
      )}
    </section>
  );
}

interface BuildStatus {
  description: string;
  label: string;
}

function buildStatus(
  report: BuildReport | null,
  source: string,
  hasStoredLine: boolean,
  wayCount: number,
): BuildStatus {
  if (report?.isPreview) {
    const resolvedCount = report.resolvedIds?.length ?? wayCount;
    return {
      description: `Previewed after joining ${resolvedCount} OpenStreetMap ${resolvedCount === 1 ? 'segment' : 'segments'}. Review the map, then save the trail to keep this line.`,
      label: 'Unsaved preview',
    };
  }

  if (report?.builtAt) {
    const builtAt = new Date(report.builtAt).toLocaleString();
    if (report.source === 'edited' || source === 'edited') {
      return {
        description: `Stored ${builtAt} after this line was drawn or adjusted here. Future saves keep this exact line.`,
        label: 'Stored with trail',
      };
    }
    const resolvedCount = report.resolvedIds?.length ?? wayCount;
    return {
      description: `Stored ${builtAt} after joining ${resolvedCount} OpenStreetMap ${resolvedCount === 1 ? 'segment' : 'segments'}. It stays unchanged until you preview and save another refresh.`,
      label: 'Stored with trail',
    };
  }

  if (source === 'imported') {
    return hasStoredLine
      ? {
          description:
            'This imported line is stored with the trail. It is not rebuilt from OpenStreetMap.',
          label: 'Stored with trail',
        }
      : {
          description:
            'This trail uses an imported line on the public map. No editable line is stored in this form yet.',
          label: 'Public map only',
        };
  }

  if (source === 'edited') {
    return hasStoredLine
      ? {
          description:
            'This drawn line is stored with the trail. Save after making changes to update its distance and elevation.',
          label: 'Stored with trail',
        }
      : {
          description:
            'No trail line is stored yet. Choose Draw line above, click along the trail, then save.',
          label: 'Not stored yet',
        };
  }

  if (wayCount > 0 && !hasStoredLine) {
    return {
      description: `${wayCount} OpenStreetMap ${wayCount === 1 ? 'segment is' : 'segments are'} selected. Save this trail to join them into one line and store it.`,
      label: 'Ready to build',
    };
  }

  if (hasStoredLine) {
    return {
      description:
        'A trail line is stored here. Choose OpenStreetMap segments above and save to connect future updates to their source.',
      label: 'Stored with trail',
    };
  }

  return {
    description:
      'No trail line is stored yet. Choose from OpenStreetMap above, click the trail segments in riding order, then save.',
    label: 'Not stored yet',
  };
}

function safeParse(value: string): BuildReport | null {
  try {
    return JSON.parse(value) as BuildReport;
  } catch {
    return null;
  }
}
