'use client';

/**
 * Renders nothing but `osmIds` validation errors.
 *
 * The way list is authored on the map above (`TrailMapEditor`, mounted on
 * `geom`), so this field has no UI of its own — but it still needs a component.
 * `admin.hidden` would be the obvious way to suppress it, and it is the wrong
 * one: the map writes to `osmIds` through `useField`, which only works while the
 * field is in the form's state. A component that renders (almost) nothing keeps
 * it there.
 *
 * Errors still have to surface somewhere. Without this, picking more ways than
 * Overpass will take in one request would fail the save with nothing on screen
 * to say why.
 */
import { useField } from '@payloadcms/ui';
import { Banner } from './admin-ui';

export function OsmIdsStatus({ path }: { path: string }) {
  const { errorMessage, showError } = useField<number[] | string>({ path });

  if (!showError) {
    return null;
  }

  return (
    <div className="field-type">
      <Banner tone="error">{errorMessage}</Banner>
    </div>
  );
}
