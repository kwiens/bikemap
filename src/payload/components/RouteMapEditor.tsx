'use client';

import { useState } from 'react';
import { useField } from '@payloadcms/ui';
import type { TrailGeometry } from '@/payload/osm/geometry';
import {
  EMPTY_PLAN,
  geometryPlan,
  parseRoutePlan,
  planGeometry,
  type RoutePlan,
} from '@/payload/routing/plan';
import { cn } from '@/lib/utils';
import { GeometryMapEditor } from './GeometryMapEditor';
import { RoutePlanner } from './RoutePlanner';
import { Banner } from './admin-ui';

/** Snapped waypoints build the route; the trail editor can override its exact line. */
export function RouteMapEditor({
  path,
  readOnly,
}: {
  path: string;
  readOnly?: boolean;
}) {
  const { value, setValue, errorMessage, showError } = useField<
    RoutePlan | string | null
  >({ path });
  const { value: name, setValue: setName } = useField<string>({ path: 'name' });
  const parsed = parseRoutePlan(value);
  const plan = parsed.ok ? parsed.plan : EMPTY_PLAN;
  const hasPointEdits = 'geometry' in plan;
  const [isEditingPoints, setIsEditingPoints] = useState(hasPointEdits);

  return (
    <div>
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Route editor"
      >
        <button
          type="button"
          className={cn(
            EDITOR_BUTTON,
            !isEditingPoints && 'bg-[color:var(--theme-elevation-150)]',
          )}
          aria-pressed={!isEditingPoints}
          disabled={hasPointEdits || !parsed.ok}
          onClick={() => setIsEditingPoints(false)}
        >
          Snap route to trails and roads
        </button>
        <button
          type="button"
          className={cn(
            EDITOR_BUTTON,
            isEditingPoints && 'bg-[color:var(--theme-elevation-150)]',
          )}
          aria-pressed={isEditingPoints}
          disabled={!parsed.ok}
          onClick={() => setIsEditingPoints(true)}
        >
          Edit points directly
        </button>
      </div>
      {hasPointEdits && (
        <Banner>
          Direct point edits are saved exactly as drawn. Rebuilding from
          waypoints replaces these edits with the snapped route.
          <button
            className={cn(EDITOR_BUTTON, 'ml-2')}
            type="button"
            disabled={readOnly}
            onClick={() => {
              const { geometry: _geometry, ...baseline } = plan;
              setValue(baseline);
              setIsEditingPoints(false);
            }}
          >
            Rebuild from waypoints
          </button>
        </Banner>
      )}
      {isEditingPoints || hasPointEdits || !parsed.ok ? (
        <GeometryMapEditor
          label="Route line"
          readOnly={readOnly || !parsed.ok}
          geometry={{
            value: parsed.ok ? planGeometry(plan) : null,
            setValue(geometry: TrailGeometry | null) {
              setValue(geometryPlan(geometry, plan));
            },
            errorMessage: showError
              ? errorMessage
              : parsed.ok
                ? undefined
                : parsed.error,
          }}
          name={{ value: name, setValue: setName }}
        />
      ) : (
        <RoutePlanner path={path} readOnly={readOnly} />
      )}
    </div>
  );
}

const EDITOR_BUTTON =
  'rounded border border-solid border-[color:var(--theme-elevation-300)] bg-transparent px-3 py-1.5 text-[0.85rem] text-[color:var(--theme-text)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';
