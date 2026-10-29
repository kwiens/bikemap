/** @vitest-environment jsdom */

import { useCallback, useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partsToFeatures, type TrailGeometry } from '@/payload/osm/geometry';
import { geometryPlan } from '@/payload/routing/plan';
import { RouteLineEditor } from './RouteLineEditor';
import { RouteMapEditor } from './RouteMapEditor';
import { TrailMapEditor } from './TrailMapEditor';

const ui = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  writes: {} as Record<string, unknown>,
  loadStyle: () => {},
  changed: () => {},
  finished: () => {},
  features: [] as GeoJSON.Feature[],
  removeMap: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  useFormProcessing: () => false,
  useFormBackgroundProcessing: () => false,
  useDocumentInfo: () => ({ data: {} }),
  toast: { success: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' }, serverURL: '' } }),
  useField: ({ path }: { path: string }) => {
    const [value, setValue] = useState(ui.values[path]);
    const write = useCallback(
      (next: unknown) => {
        ui.writes[path] = next;
        setValue(next);
      },
      [path],
    );
    return { value, setValue: write };
  },
}));

vi.mock('@/config/map.config', () => ({
  isCityId: () => false,
  mapConfig: {
    mapbox: { accessToken: 'test-token' },
    defaultView: { center: [-85, 35], zoom: 10 },
  },
}));
vi.mock('@/utils/map', () => ({ OSM_BIKE_TRAIL_FILTER: [] }));
vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {
      addControl() {}
      setFilter() {}
      setLayoutProperty() {}
      doubleClickZoom = { disable() {}, enable() {} };
      on(event: string, callback: () => void) {
        if (event === 'style.load') ui.loadStyle = callback;
      }
      getSource() {
        return null;
      }
      getLayer() {
        return null;
      }
      addSource() {}
      addLayer() {}
      getCanvas() {
        return { style: {} };
      }
      fitBounds() {}
      remove() {
        ui.removeMap();
      }
    },
    NavigationControl: class {},
  },
}));
vi.mock('./RoutePlanner', () => ({
  RoutePlanner: () => <div>Snapping route planner</div>,
}));
vi.mock('terra-draw', () => ({
  TerraDraw: class {
    on(event: string, callback: () => void) {
      if (event === 'change') ui.changed = callback;
      if (event === 'finish') ui.finished = callback;
    }
    start() {}
    stop() {}
    setMode() {}
    clear() {
      ui.features = [];
    }
    clearUndoRedoHistory() {}
    addFeatures(features: GeoJSON.Feature[]) {
      ui.features = features;
      return [];
    }
    selectFeature() {}
    getSnapshot() {
      return ui.features;
    }
    canRedo() {
      return false;
    }
    canUndo() {
      return false;
    }
  },
  TerraDrawLineStringMode: class {},
  TerraDrawModeUndoRedo: class {},
  TerraDrawSelectMode: class {},
}));
vi.mock('terra-draw-mapbox-gl-adapter', () => ({
  TerraDrawMapboxGLAdapter: class {},
}));
vi.mock('./route-tool', () => ({
  createRouteTool: () => ({
    dispose() {},
    install() {},
    hasRoute: () => false,
    setTrails() {},
    activate() {},
    deactivate() {},
  }),
}));
vi.mock('./point-selection-tool', () => ({
  createPointSelectionTool: () => ({
    dispose() {},
    install() {},
    refresh() {},
    clear() {},
    setSelection() {},
  }),
}));

const ORIGINAL: TrailGeometry = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-85, 35],
      [-85.01, 35.01],
    ],
  ],
};
const GPX = `<gpx><trk><name>Uploaded ride</name><trkseg>
  <trkpt lon="-121.4" lat="44"/><trkpt lon="-121.39" lat="44.01"/>
  </trkseg></trk></gpx>`;

beforeEach(() => {
  ui.values = {
    geom: ORIGINAL,
    plan: geometryPlan(ORIGINAL),
    city: null,
    name: '',
    trailName: '',
    osmIds: [],
    geometrySource: 'osm',
  };
  ui.writes = {};
  ui.features = [];
  ui.removeMap.mockClear();
});

async function upload(container: HTMLElement, text = GPX) {
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [{ name: 'ride.gpx', size: text.length, text: async () => text }],
    },
  });
  await waitFor(() =>
    expect(screen.getByText(/Imported ride.gpx|ride.gpx:/)).toBeInTheDocument(),
  );
}

describe('shared geometry editor', () => {
  it('edits a legacy snapped route with the trail point engine and restores its snapping baseline explicitly', async () => {
    const baseline = {
      version: 1 as const,
      waypoints: [ORIGINAL.coordinates[0][0], ORIGINAL.coordinates[0][1]],
      legs: [
        {
          coordinates: ORIGINAL.coordinates[0],
          mode: 'network' as const,
          steps: [],
        },
      ],
    };
    ui.values.plan = baseline;
    render(<RouteMapEditor path="plan" />);
    expect(screen.getByText('Snapping route planner')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit points directly' }),
    );
    await act(async () => ui.loadStyle());
    expect(ui.writes).not.toHaveProperty('plan');
    const edited: TrailGeometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [-85, 35],
          [-85.02, 35.01],
          [-85.01, 35.01],
        ],
      ],
    };
    act(() => {
      ui.features = partsToFeatures(edited.coordinates, 'linestring');
      ui.changed();
      ui.finished();
    });
    expect(ui.writes.plan).toEqual(geometryPlan(edited, baseline));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((ui.writes.plan as { geometry: TrailGeometry }).geometry).toEqual(
      ORIGINAL,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ui.writes.plan).toEqual(geometryPlan(edited, baseline));
    fireEvent.click(
      screen.getByRole('button', { name: 'Rebuild from waypoints' }),
    );
    expect(ui.writes.plan).toEqual(baseline);
    expect(screen.getByText('Snapping route planner')).toBeInTheDocument();
  });

  it('starts a new drawn route with a blank map and the Draw tool active', async () => {
    ui.values.geom = null;
    ui.values.geometrySource = 'drawn';
    render(<RouteLineEditor path="geom" />);
    await act(async () => ui.loadStyle());
    expect(screen.getByRole('button', { name: 'Draw line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('No line yet')).toBeInTheDocument();
    expect(screen.getByText(/Click to add points/)).toBeInTheDocument();
    expect(ui.writes).toEqual({});
    const coordinates: TrailGeometry['coordinates'] = [
      [
        [-85, 35],
        [-85.01, 35.01],
      ],
    ];
    act(() => {
      ui.features = partsToFeatures(coordinates, 'linestring');
      ui.changed();
      ui.finished();
    });
    expect(ui.writes.geom).toEqual({ type: 'MultiLineString', coordinates });
    expect(ui.writes).not.toHaveProperty('plan');
    expect(ui.writes).not.toHaveProperty('geometrySource');
  });

  it('imports and undoes a route GPX without writing trail-only fields or remounting the map', async () => {
    const { container } = render(<RouteMapEditor path="plan" />);
    act(() => ui.loadStyle());
    expect(
      screen.getByRole('application', { name: 'Route line map' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose from OpenStreetMap' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import GPX' })).toBeEnabled();

    await upload(container);
    expect(ui.writes.plan).toEqual(
      geometryPlan({
        type: 'MultiLineString',
        coordinates: [
          [
            [-121.4, 44],
            [-121.39, 44.01],
          ],
        ],
      }),
    );
    expect(ui.writes.name).toBe('Uploaded ride');
    expect(ui.writes).not.toHaveProperty('geometrySource');
    expect(ui.writes).not.toHaveProperty('osmIds');
    expect(ui.writes).not.toHaveProperty('trailName');
    expect(
      screen.getByText(/save to measure its distance\./),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ui.writes.plan).toEqual(geometryPlan(ORIGINAL));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ui.writes.plan).not.toEqual(geometryPlan(ORIGINAL));
    expect(ui.removeMap).not.toHaveBeenCalled();
  });

  it('retains trail OSM controls and takes ownership when a GPX replaces the line', async () => {
    const { container } = render(<TrailMapEditor path="geom" />);
    act(() => ui.loadStyle());
    expect(
      screen.getByRole('button', { name: 'Choose from OpenStreetMap' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await upload(container);
    expect(ui.writes.geometrySource).toBe('edited');
    expect(ui.writes.trailName).toBe('Uploaded ride');
    expect(ui.writes).not.toHaveProperty('name');
    expect(screen.getByRole('button', { name: 'Adjust line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(/save to measure its distance and elevation/),
    ).toBeInTheDocument();
    expect(ui.removeMap).not.toHaveBeenCalled();
  });

  it('leaves the saved line untouched when a GPX is invalid', async () => {
    const { container } = render(<RouteMapEditor path="plan" />);
    act(() => ui.loadStyle());
    await upload(container, '<not-gpx/>');
    expect(ui.writes).not.toHaveProperty('plan');
    expect(screen.getByText(/not a GPX document/)).toBeInTheDocument();
  });

  it('disables import and editing on a read-only route', () => {
    render(<RouteMapEditor path="plan" readOnly />);
    act(() => ui.loadStyle());
    for (const name of [
      'Import GPX',
      'Draw line',
      'Adjust line',
      'Select points',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
