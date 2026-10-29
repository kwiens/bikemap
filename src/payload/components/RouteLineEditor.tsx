'use client';

import { useField } from '@payloadcms/ui';
import type { TrailGeometry } from '@/payload/osm/geometry';
import { GeometryMapEditor } from './GeometryMapEditor';

/** New routes snap to paths by default and share the trail point editing tools. */
export function RouteLineEditor({
  path,
  readOnly,
}: {
  path: string;
  readOnly?: boolean;
}) {
  const { value, setValue, errorMessage, showError } = useField<
    TrailGeometry | string | null
  >({ path });
  const { value: name, setValue: setName } = useField<string>({ path: 'name' });
  const { value: source } = useField<string>({ path: 'geometrySource' });
  return (
    <GeometryMapEditor
      key={source}
      hasPathSnappingToggle={source === 'drawn'}
      label="Route line"
      readOnly={readOnly || source !== 'drawn'}
      geometry={{
        value,
        setValue,
        errorMessage: showError ? errorMessage : undefined,
      }}
      name={{ value: name, setValue: setName }}
    />
  );
}
