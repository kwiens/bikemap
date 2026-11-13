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
import {
  partsToFeatures,
  roundParts,
  type TrailGeometry,
} from '@/payload/osm/geometry';
import { geometryPlan } from '@/payload/routing/plan';
import { RouteLineEditor } from './RouteLineEditor';
import { RouteMapEditor } from './RouteMapEditor';
import { TrailMapEditor } from './TrailMapEditor';

const ui = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  writes: {} as Record<string, unknown>,
  loadStyle: () => {},
  changed: () => {},
  finished: (_id?: string, _context?: { mode: string; action: string }) => {},
  features: [] as GeoJSON.Feature[],
  clickMap: (_point: [number, number], _altKey: boolean) => {},
  sourceData: new Map<string, unknown>(),
  zoom: 10,
  removeMap: vi.fn(),
  selectFeature: vi.fn(),
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
      private handlers = new Map<string, Set<(event?: unknown) => void>>();

      constructor() {
        ui.clickMap = ([lng, lat], altKey) => {
          const lngLat = { lng, lat };
          for (const handle of this.handlers.get('click') ?? []) {
            handle({
              lngLat,
              point: this.project(lngLat),
              originalEvent: { altKey },
            });
          }
        };
      }
      addControl() {}
      setFilter() {}
      setLayoutProperty() {}
      doubleClickZoom = { disable() {}, enable() {} };
      on(event: string, callback: string | ((event?: unknown) => void)) {
        if (typeof callback !== 'function') return;
        if (event === 'style.load') ui.loadStyle = callback;
        const handlers = this.handlers.get(event) ?? new Set();
        handlers.add(callback);
        this.handlers.set(event, handlers);
      }
      off(event: string, callback: (event?: unknown) => void) {
        this.handlers.get(event)?.delete(callback);
      }
      getSource(id: string) {
        return ui.sourceData.has(id)
          ? { setData: (data: unknown) => ui.sourceData.set(id, data) }
          : undefined;
      }
      getLayer() {
        return null;
      }
      addSource(id: string, source: { data?: unknown }) {
        ui.sourceData.set(id, source.data);
      }
      addLayer() {}
      getCanvas() {
        return { style: {} };
      }
      getZoom() {
        return ui.zoom;
      }
      getBounds() {
        return {
          getEast: () => -85.286,
          getNorth: () => 35.051,
          getSouth: () => 35.049,
          getWest: () => -85.294,
        };
      }
      project(location: { lng: number; lat: number } | [number, number]) {
        const [lng, lat] = Array.isArray(location)
          ? location
          : [location.lng, location.lat];
        const scale = ui.zoom === 10 ? 10000 : 100000;
        const x = lng * scale;
        const y = lat * scale;
        return {
          x,
          y,
          dist: (other: { x: number; y: number }) =>
            Math.hypot(x - other.x, y - other.y),
        };
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
    private mode = 'static';

    on(event: string, callback: typeof ui.finished) {
      if (event === 'change') ui.changed = callback;
      if (event === 'finish') {
        ui.finished = (id, context = { mode: this.mode, action: 'edit' }) =>
          callback(id, context);
      }
    }
    start() {}
    stop() {}
    getMode() {
      return this.mode;
    }
    setMode(mode: string) {
      this.mode = mode;
    }
    clear() {
      ui.features = [];
    }
    clearUndoRedoHistory() {}
    addFeatures(features: GeoJSON.Feature[]) {
      // Terra Draw gives every stored feature an id; selecting needs one.
      ui.features = features.map((feature, index) => ({
        ...feature,
        id: feature.id ?? `feature-${index}`,
      }));
      return [];
    }
    selectFeature(id: unknown, mode: unknown) {
      ui.selectFeature(id, mode);
    }
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
  ui.sourceData.clear();
  ui.zoom = 10;
  ui.removeMap.mockClear();
  ui.selectFeature.mockClear();
});

/** Moves the line's last point the way a Terra Draw drag would. */
function dragLastPoint(to: [number, number]) {
  const [feature] = ui.features;
  ui.features = [
    {
      ...feature,
      geometry: { type: 'LineString', coordinates: [[-85, 35], to] },
    },
  ];
  act(() => ui.changed());
  act(() => ui.finished());
}

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

  it('opens a snapped route with full-precision points without changing its stored plan', async () => {
    const coordinates: TrailGeometry['coordinates'] = [
      [
        [-85.30912345678901, 35.05312345678901],
        [-85.30523456789012, 35.05423456789012],
        [-85.30134567890123, 35.05834567890123],
      ],
    ];
    const baseline = {
      version: 1 as const,
      waypoints: [coordinates[0][0], coordinates[0][2]],
      legs: [
        { coordinates: coordinates[0], mode: 'network' as const, steps: [] },
      ],
    };
    ui.values.plan = baseline;
    render(<RouteMapEditor path="plan" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit points directly' }),
    );
    await act(async () => ui.loadStyle());
    expect(ui.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: roundParts(coordinates)[0],
    });
    expect(screen.getByRole('button', { name: 'Adjust line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Select points' })).toBeEnabled();
    expect(screen.queryByText(/could not attach/)).not.toBeInTheDocument();
    expect(ui.writes).not.toHaveProperty('plan');
    expect(baseline.legs[0].coordinates[0]).toEqual([
      -85.30912345678901, 35.05312345678901,
    ]);
  });

  it('starts a blank route in path snapping and switches to point editing without losing the line', async () => {
    ui.values.geom = null;
    ui.values.geometrySource = 'drawn';
    render(<RouteLineEditor path="geom" />);
    await act(async () => ui.loadStyle());
    expect(
      screen.getByRole('button', { name: 'Path snapping' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('button', { name: 'Draw line' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Point editing' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Path snapping' }));
    expect(
      screen.getByRole('button', { name: 'Path snapping' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Point editing' }));
    expect(screen.getByRole('button', { name: 'Adjust line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(ui.writes.geom).toEqual({ type: 'MultiLineString', coordinates });
    expect(ui.removeMap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ui.writes.geom).toBeNull();
  });

  it('finishes an in-progress snapped line before opening its point handles', async () => {
    ui.values.geom = null;
    ui.values.geometrySource = 'drawn';
    render(<RouteLineEditor path="geom" />);
    await act(async () => ui.loadStyle());
    const coordinates: TrailGeometry['coordinates'] = [
      [
        [-85, 35],
        [-85.01, 35.01],
      ],
    ];
    act(() => coordinates[0].forEach((point) => ui.clickMap(point, true)));
    fireEvent.click(screen.getByRole('button', { name: 'Point editing' }));
    expect(ui.writes.geom).toEqual({ type: 'MultiLineString', coordinates });
    expect(screen.getByRole('button', { name: 'Adjust line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(ui.removeMap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ui.writes.geom).toBeNull();
  });

  it('undoes and redoes each snapped waypoint before and after finishing', async () => {
    ui.values.geom = null;
    ui.values.geometrySource = 'drawn';
    render(<RouteLineEditor path="geom" />);
    await act(async () => ui.loadStyle());

    const points: [number, number][] = [
      [-85, 35],
      [-85.01, 35.01],
      [-85.02, 35.02],
    ];
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    const map = screen.getByRole('application', { name: 'Route line map' });
    act(() => points.forEach((point) => ui.clickMap(point, true)));
    fireEvent.keyDown(map, { key: 'z', ctrlKey: true });
    expect(ui.sourceData.get('route-tool-path')).toMatchObject({
      features: [{ geometry: { coordinates: points.slice(0, 2) } }],
    });
    expect(redo).toBeEnabled();
    fireEvent.keyDown(map, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(ui.sourceData.get('route-tool-path')).toMatchObject({
      features: [{ geometry: { coordinates: points } }],
    });
    expect(ui.writes).toEqual({});

    fireEvent.click(screen.getByRole('button', { name: 'Finish route' }));
    expect(ui.writes.geom).toMatchObject({ coordinates: [points] });
    fireEvent.click(undo);
    expect(ui.writes.geom).toMatchObject({ coordinates: [points.slice(0, 2)] });
    fireEvent.click(undo);
    expect(ui.writes.geom).toBeNull();
    expect(ui.sourceData.get('editor-history-point')).toMatchObject({
      features: [{ geometry: { coordinates: points[0] } }],
    });
    fireEvent.click(undo);
    expect(ui.sourceData.get('editor-history-point')).toMatchObject({
      features: [],
    });
    expect(undo).toBeDisabled();

    fireEvent.click(redo);
    expect(ui.sourceData.get('editor-history-point')).toMatchObject({
      features: [{ geometry: { coordinates: points[0] } }],
    });
    fireEvent.click(redo);
    expect(ui.writes.geom).toMatchObject({ coordinates: [points.slice(0, 2)] });
    fireEvent.click(redo);
    expect(ui.writes.geom).toMatchObject({ coordinates: [points] });
    expect(redo).toBeDisabled();
  });

  it('uses the route network and switches between snapped and manual clicks mid-route', async () => {
    ui.values.geom = null;
    ui.values.geometrySource = 'drawn';
    ui.zoom = 15;
    const street = [
      [-85.293, 35.05],
      [-85.291, 35.05],
    ];
    const sidewalk = [
      [-85.291, 35.05],
      [-85.29, 35.05],
      [-85.29, 35.0505],
      [-85.288, 35.0505],
    ];
    const fetchNetwork = vi.fn(async () =>
      Response.json({
        ways: [
          { id: 1, class: 'street', coordinates: street, nodes: [1, 2] },
          {
            id: 2,
            class: 'footway',
            coordinates: sidewalk,
            nodes: [2, 3, 4, 5],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchNetwork);
    try {
      render(<RouteLineEditor path="geom" />);
      await act(async () => ui.loadStyle());
      await screen.findByText('Network loaded for this area.');
      expect(fetchNetwork).toHaveBeenCalledExactlyOnceWith(
        '/api/routes/network?cell=-2133,876',
        { credentials: 'same-origin' },
      );

      const start: [number, number] = [-85.293, 35.05];
      const junction: [number, number] = [-85.291, 35.05];
      const firstManual: [number, number] = [-85.2905, 35.05025];
      const secondManual: [number, number] = [-85.29, 35.049];
      const finish: [number, number] = [-85.288, 35.0505];
      act(() => {
        ui.clickMap(start, false);
        ui.clickMap(junction, false);
      });
      const manual = screen.getByRole('button', { name: 'Manual points' });
      fireEvent.click(manual);
      expect(manual).toHaveAttribute('aria-pressed', 'true');
      act(() => {
        ui.clickMap(firstManual, false);
        ui.clickMap(secondManual, false);
      });
      fireEvent.click(manual);
      expect(manual).toHaveAttribute('aria-pressed', 'false');
      act(() => ui.clickMap(finish, false));
      fireEvent.click(screen.getByRole('button', { name: 'Finish route' }));
      expect(ui.writes.geom).toMatchObject({
        coordinates: [
          [
            start,
            junction,
            firstManual,
            secondManual,
            [-85.29, 35.05],
            [-85.29, 35.0505],
            finish,
          ],
        ],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('undoes an extension at the start of a line without changing its existing points', async () => {
    ui.values.geometrySource = 'drawn';
    render(<RouteLineEditor path="geom" />);
    await act(async () => ui.loadStyle());
    fireEvent.click(screen.getByRole('button', { name: 'Path snapping' }));

    const [line] = ORIGINAL.coordinates;
    const first: [number, number] = [-84.99, 35];
    const second: [number, number] = [-84.98, 35];
    act(() => {
      ui.clickMap(line[0], false);
      ui.clickMap(first, true);
      ui.clickMap(second, true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Finish route' }));
    expect(ui.writes.geom).toMatchObject({
      coordinates: [[second, first, ...line]],
    });
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    expect(ui.writes.geom).toMatchObject({ coordinates: [[first, ...line]] });
    fireEvent.click(undo);
    expect(ui.writes.geom).toEqual(ORIGINAL);
    expect(undo).toBeDisabled();
  });

  it('records the clicked vertices of a finished freehand line', async () => {
    ui.values.geom = null;
    render(<TrailMapEditor path="geom" />);
    await act(async () => ui.loadStyle());
    fireEvent.click(screen.getByRole('button', { name: 'Draw line' }));

    const points: [number, number][] = [
      [-85, 35],
      [-85.01, 35.01],
      [-85.02, 35.02],
    ];
    const feature: GeoJSON.Feature = {
      id: 'freehand',
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points },
      properties: { mode: 'linestring' },
    };
    act(() => {
      ui.features = [
        {
          ...feature,
          geometry: {
            type: 'LineString',
            coordinates: [...points, [-85.03, 35.03]],
          },
          properties: { ...feature.properties, currentlyDrawing: true },
        },
      ];
      ui.changed();
    });
    expect(ui.writes).toEqual({});
    act(() => {
      ui.features = [feature];
      ui.changed();
      ui.finished('freehand', { mode: 'linestring', action: 'draw' });
    });
    expect(ui.writes.geom).toMatchObject({ coordinates: [points] });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ui.writes.geom).toMatchObject({ coordinates: [points.slice(0, 2)] });
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ui.writes.geom).toMatchObject({ coordinates: [points] });
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

  it('keeps a dragged point at Terra Draw precision as an undoable edit, not a reload', async () => {
    render(<TrailMapEditor path="geom" />);
    act(() => ui.loadStyle());
    fireEvent.click(screen.getByRole('button', { name: 'Adjust line' }));
    // Loading the line holds edits back until a microtask clears it.
    await act(async () => {});

    // The real adapter would round to the precision it was given; a stray
    // 9-decimal coordinate (its default) must still not read as a new document.
    const [feature] = ui.features;
    ui.features = [
      {
        ...feature,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85, 35],
            [-85.012345678, 35.012345678],
          ],
        },
      },
    ];
    act(() => ui.changed());
    act(() => ui.finished());

    expect(ui.writes.geom).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [-85, 35],
          [-85.0123457, 35.0123457],
        ],
      ],
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('hands an OSM trail back to OSM when its GPX import is undone', async () => {
    const report = { gaps: [], isPreview: false, source: 'osm' };
    ui.values.osmReport = report;
    ui.values.rebuildGeometry = false;
    const { container } = render(<TrailMapEditor path="geom" />);
    act(() => ui.loadStyle());
    await upload(container);
    expect(ui.writes.geometrySource).toBe('edited');
    expect(ui.writes.osmReport).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ui.writes.geom).toEqual(ORIGINAL);
    expect(ui.writes.geometrySource).toBe('osm');
    expect(ui.writes.osmReport).toBe(report);
    expect(ui.writes.rebuildGeometry).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ui.writes.geometrySource).toBe('edited');
    expect(ui.writes.osmReport).toBeNull();
  });

  it('keeps unsaved hand edits undoable after refreshing from OSM', async () => {
    const preview: TrailGeometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [-85, 35],
          [-85.03, 35.03],
        ],
      ],
    };
    ui.values.osmIds = [101];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        geometry: preview,
        measurements: {
          bounds: [-85.03, 35, -85, 35.03],
          distance: 4000,
          elevationGain: null,
          elevationLoss: null,
          elevationMax: null,
          elevationMin: null,
        },
        message: 'Refreshed.',
        report: { gaps: [], missingIds: [], resolvedIds: [101], warnings: [] },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<TrailMapEditor path="geom" />);
      act(() => ui.loadStyle());
      fireEvent.click(screen.getByRole('button', { name: 'Adjust line' }));
      await act(async () => {});
      dragLastPoint([-85.02, 35.02]);
      expect(ui.writes.geometrySource).toBe('edited');

      fireEvent.click(
        screen.getByRole('button', { name: 'Choose from OpenStreetMap' }),
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Refresh line from OpenStreetMap',
          }),
        );
      });
      await waitFor(() => expect(ui.writes.geom).toEqual(preview));
      expect(ui.writes.geometrySource).toBe('osm');
      expect(screen.getByText(/only a preview/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Adjust line' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(ui.writes.geom).toEqual({
        type: 'MultiLineString',
        coordinates: [
          [
            [-85, 35],
            [-85.02, 35.02],
          ],
        ],
      });
      expect(ui.writes.geometrySource).toBe('edited');
      expect(screen.queryByText(/only a preview/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never selects a read-only line, which would give it drag handles', () => {
    render(<RouteLineEditor path="geom" readOnly />);
    act(() => ui.loadStyle());
    expect(ui.selectFeature).not.toHaveBeenCalled();
  });

  it('selects an editable line on load so its points can be grabbed', () => {
    render(<TrailMapEditor path="geom" />);
    act(() => ui.loadStyle());
    fireEvent.click(screen.getByRole('button', { name: 'Adjust line' }));
    expect(ui.selectFeature).toHaveBeenCalledWith('feature-0', 'select');
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
