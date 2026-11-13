/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { createEditorMap } from './editor-map';
import type { Position } from '@/payload/routing/graph';
import { EMPTY_PLAN, type RoutePlan } from '@/payload/routing/plan';
import { RoutePlanner } from './RoutePlanner';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  plan: { legs: [], version: 1, waypoints: [] } as RoutePlan,
  write: vi.fn(),
  ensure: vi.fn(),
  queryRenderedFeatures: vi.fn(),
  layers: [] as string[],
  sources: new Map<string, unknown>(),
  setStyle: vi.fn(),
}));
vi.mock('@payloadcms/ui', () => ({
  useField: ({ path }: { path: string }) => ({
    setValue: mocks.write,
    value: path === 'plan' ? mocks.plan : path === 'city' ? 'bend' : '#2563EB',
  }),
}));
vi.mock('@/config/map.config', () => ({
  mapConfig: { mapbox: { accessToken: 'test' }, defaultView: { zoom: 10 } },
  cityConfigs: { bend: { defaultView: { zoom: 10 } } },
  isCityId: (value: unknown) => value === 'bend',
}));
vi.mock('./editor-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./editor-map')>()),
  createEditorMap: vi.fn(() => ({
    on: (name: string, ...args: unknown[]) =>
      mocks.handlers.set(name, args.at(-1) as (event: unknown) => void),
    doubleClickZoom: { disable: vi.fn() },
    queryRenderedFeatures: mocks.queryRenderedFeatures,
    getSource: (id: string) =>
      mocks.sources.has(id)
        ? { setData: (data: unknown) => mocks.sources.set(id, data) }
        : undefined,
    addSource: (id: string, { data }: { data: unknown }) =>
      mocks.sources.set(id, data),
    addLayer: ({ id }: { id: string }) => mocks.layers.push(id),
    getZoom: () => 10,
    setPaintProperty: vi.fn(),
    setStyle: mocks.setStyle,
    remove: vi.fn(),
  })),
}));
vi.mock('mapbox-gl', () => ({
  default: {
    Marker: class {
      setLngLat() {
        return this;
      }
      addTo() {
        return this;
      }
      on() {
        return this;
      }
      remove() {}
    },
  },
}));
vi.mock('@/payload/routing/network-store', () => ({
  cellsAround: (point: Position) => [String(point[0])],
  cellsForLeg: () => [],
  RouteNetworkStore: class {
    ensure = mocks.ensure;
    graphFor() {
      return null;
    }
    allWays() {
      return [];
    }
    setTrails() {}
  },
}));

function click(point: Position, shiftKey = false) {
  mocks.handlers.get('click')?.({
    lngLat: { lng: point[0], lat: point[1] },
    originalEvent: { target: document.createElement('canvas'), shiftKey },
  });
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(createEditorMap).mockClear();
  mocks.handlers.clear();
  mocks.layers = ['outdoors'];
  mocks.sources.clear();
  mocks.setStyle
    .mockReset()
    .mockImplementation((style: string, options?: { diff: boolean }) => {
      mocks.layers = [style];
      mocks.sources.clear();
      // Mapbox style diffs can remove overlays without emitting style.load.
      if (options?.diff === false) mocks.handlers.get('style.load')?.(null);
    });
  mocks.plan = EMPTY_PLAN;
  mocks.write.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(undefined);
  mocks.queryRenderedFeatures.mockReset().mockReturnValue([]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('restores the route above the basemap after repeated satellite switches', async () => {
  const coordinates: Position[] = [
    [-121.4, 44],
    [-121.39, 44],
  ];
  mocks.plan = {
    version: 1,
    waypoints: coordinates,
    legs: [{ coordinates, mode: 'straight', steps: [] }],
  };
  render(<RoutePlanner path="plan" />);
  await act(async () => mocks.handlers.get('style.load')?.(null));

  const toggle = screen.getByRole('button', { name: 'Satellite' });
  const basemaps = [
    'mapbox://styles/mapbox/satellite-streets-v12',
    'mapbox://styles/mapbox/outdoors-v12',
    'mapbox://styles/mapbox/satellite-streets-v12',
  ];
  for (const basemap of basemaps) {
    fireEvent.click(toggle);
    expect(mocks.layers[0]).toBe(basemap);
    expect(mocks.layers.slice(-3)).toEqual([
      'route-editor-route-casing',
      'route-editor-route',
      'route-editor-route-hit',
    ]);
    expect(mocks.sources.get('route-editor-route')).toMatchObject({
      features: [{ geometry: { coordinates } }],
    });
  }
  expect(createEditorMap).toHaveBeenCalledTimes(1);
  expect(mocks.write).not.toHaveBeenCalled();
});

describe('route waypoint network races', () => {
  it('appends clicks over an existing route and uses Shift-click to insert a waypoint', async () => {
    const start: Position = [-121.4, 44];
    const end: Position = [-121.39, 44];
    const doubledBack: Position = [-121.395, 44];
    const inserted: Position = [-121.398, 44];
    render(<RoutePlanner path="plan" />);
    await act(async () => {
      click(start);
      click(end);
    });
    mocks.queryRenderedFeatures.mockReturnValue([{ properties: { leg: 0 } }]);
    await act(async () => click(doubledBack));
    expect(mocks.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(mocks.write.mock.lastCall?.[0].waypoints).toEqual([
      start,
      end,
      doubledBack,
    ]);

    await act(async () => click(inserted, true));
    expect(mocks.write.mock.lastCall?.[0].waypoints).toEqual([
      start,
      inserted,
      end,
      doubledBack,
    ]);
  });

  it('adds several exact manual points and resumes network routing on the next click', async () => {
    const start: Position = [-121.4, 44];
    const manualA: Position = [-121.395, 44.003];
    const manualB: Position = [-121.392, 44.002];
    const finish: Position = [-121.39, 44];
    render(<RoutePlanner path="plan" />);
    await act(async () => click(start));
    mocks.ensure.mockClear();
    const toggle = screen.getByRole('button', { name: 'Manual points' });
    fireEvent.click(toggle);
    await act(async () => {
      click(manualA);
      click(manualB);
    });
    expect(mocks.ensure).not.toHaveBeenCalled();
    const manualPlan: RoutePlan = mocks.write.mock.lastCall?.[0];
    expect(manualPlan.waypoints).toEqual([start, manualA, manualB]);
    expect(manualPlan.legs.map(({ mode }) => mode)).toEqual([
      'straight',
      'straight',
    ]);

    fireEvent.click(toggle);
    await act(async () => click(finish));
    const finalPlan: RoutePlan = mocks.write.mock.lastCall?.[0];
    expect(finalPlan.waypoints).toEqual([start, manualA, manualB, finish]);
    expect(finalPlan.legs.map(({ mode }) => mode)).toEqual([
      'straight',
      'straight',
      'network',
    ]);
    expect(mocks.ensure).toHaveBeenCalled();
  });

  it('keeps click order when the second snap finishes first', async () => {
    const first = deferred();
    const second = deferred();
    mocks.ensure.mockImplementation((keys: string[]) =>
      keys[0] === '-121.4' ? first.promise : second.promise,
    );
    render(<RoutePlanner path="plan" />);
    act(() => {
      click([-121.4, 44]);
      click([-121.39, 44.01]);
    });
    await act(async () => {
      second.resolve();
    });
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => {
      first.resolve();
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toEqual([
      [-121.4, 44],
      [-121.39, 44.01],
    ]);
  });

  it('does not resurrect a cleared route when a pending snap finishes', async () => {
    const pending = deferred();
    render(<RoutePlanner path="plan" />);
    await act(async () => {
      click([-121.4, 44]);
    });
    mocks.ensure.mockReturnValue(pending.promise);
    act(() => {
      click([-121.39, 44.01]);
    });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await act(async () => {
      pending.resolve();
    });
    expect(mocks.write.mock.calls.at(-1)?.[0]).toEqual(EMPTY_PLAN);
  });

  it('does not add a pending waypoint after Undo', async () => {
    const pending = deferred();
    render(<RoutePlanner path="plan" />);
    await act(async () => {
      click([-121.4, 44]);
    });
    mocks.ensure.mockReturnValueOnce(pending.promise);
    act(() => {
      click([-121.39, 44.01]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    // New clicks after Undo need not wait for the cancelled request.
    await act(async () => {
      click([-121.38, 44.02]);
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toEqual([
      [-121.38, 44.02],
    ]);
    await act(async () => {
      pending.resolve();
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toEqual([
      [-121.38, 44.02],
    ]);
  });

  it('does not write a routed leg back after the editor unmounts', async () => {
    const pending = deferred();
    mocks.ensure
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(pending.promise);
    const view = render(<RoutePlanner path="plan" />);
    await act(async () => {
      click([-121.4, 44]);
    });
    await act(async () => {
      click([-121.39, 44.01]);
    });
    expect(mocks.write).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => {
      pending.resolve();
    });
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });

  it('restores a routed plan with Undo/Redo and clears Redo after a new edit', async () => {
    render(<RoutePlanner path="plan" />);
    await act(async () => {
      click([-121.4, 44]);
    });
    await act(async () => {
      click([-121.39, 44.01]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toEqual([
      [-121.4, 44],
      [-121.39, 44.01],
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    await act(async () => {
      click([-121.38, 44.02]);
    });
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toEqual([
      [-121.4, 44],
      [-121.38, 44.02],
    ]);
  });

  it('keeps one map instance through edits after Strict Mode effect replay', async () => {
    render(
      <StrictMode>
        <RoutePlanner path="plan" />
      </StrictMode>,
    );
    expect(createEditorMap).toHaveBeenCalledTimes(2);
    await act(async () => {
      click([-121.4, 44]);
    });
    await act(async () => {
      click([-121.39, 44.01]);
    });
    expect(mocks.write.mock.calls.at(-1)?.[0].waypoints).toHaveLength(2);
    expect(createEditorMap).toHaveBeenCalledTimes(2);
  });

  it('accepts a new document without rebuilding the map or writing it back', async () => {
    const view = render(<RoutePlanner path="plan" />);
    await act(async () => {
      click([-121.4, 44]);
    });
    mocks.write.mockClear();
    mocks.plan = { version: 1, waypoints: [[-121.38, 44.02]], legs: [] };
    view.rerender(<RoutePlanner path="plan" />);
    expect(screen.getByText('44.02000, -121.38000')).toBeInTheDocument();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(createEditorMap).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('ignores a pending click after unmount', async () => {
    const pending = deferred();
    mocks.ensure.mockReturnValue(pending.promise);
    const view = render(<RoutePlanner path="plan" />);
    act(() => {
      click([-121.4, 44]);
    });
    view.unmount();
    await act(async () => {
      pending.resolve();
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
