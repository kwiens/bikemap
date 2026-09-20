'use client';

import { useField } from '@payloadcms/ui';
import { parseTrailGeometry, type TrailGeometry } from '@/payload/osm/geometry';

interface SourceCopy {
  description: string;
  label: string;
}

/**
 * Explains the trail line's ownership without exposing the internal source
 * enum as a choice. The map editor changes this value when someone draws or
 * adjusts a line; direct source changes would be easy to make accidentally and
 * can change what a future save rebuilds.
 */
export function GeometrySourceField({ path }: { path: string }) {
  const { value: source } = useField<string>({ path });
  const { value: geometry } = useField<TrailGeometry | string | null>({
    path: 'geom',
  });
  const parsed = parseTrailGeometry(geometry);
  const hasStoredLine = parsed.ok && parsed.parts.length > 0;
  const copy = sourceCopy(source, hasStoredLine);

  return (
    <div className="field-type">
      <div className="field-label">Trail line source</div>
      <div className="rounded-[var(--style-radius-s)] bg-[var(--theme-elevation-50)] p-3">
        <strong className="block text-sm leading-tight">{copy.label}</strong>
        <p className="mb-0 mt-1 text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.45]">
          {copy.description}
        </p>
      </div>
    </div>
  );
}

function sourceCopy(
  source: string | undefined,
  hasStoredLine: boolean,
): SourceCopy {
  if (source === 'edited') {
    return {
      description:
        'This line was drawn or adjusted here. Saving keeps exactly what you see instead of replacing it from OpenStreetMap.',
      label: 'Drawn here',
    };
  }

  if (source === 'imported') {
    return hasStoredLine
      ? {
          description:
            'This line came from city or partner map data and is stored with the trail. Saving leaves it unchanged unless you adjust or replace it.',
          label: 'Imported map line',
        }
      : {
          description:
            'The public map line comes from city or partner data, but no editable line is stored here. Choose OpenStreetMap trails or draw a replacement to maintain it in the CMS.',
          label: 'Imported map line',
        };
  }

  return {
    description:
      'This line is built from the OpenStreetMap trail segments selected under Trail line. Saving refreshes the line and stores it with this trail.',
    label: 'OpenStreetMap',
  };
}
