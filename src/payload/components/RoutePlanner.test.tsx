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
vi.mock('./editor-map', () => ({
  createEditorMap: vi.fn(() => ({
    on: (name: string, ...args: unknown[]) =>
      mocks.handlers.set(name, args.at(-1) as (event: unknown) => void),
    doubleClickZoom: { disable: vi.fn() },
    queryRenderedFeatures: () => [],
    getSource: () => undefined,
    remove: vi.fn(),
  })),
  useEditorBasemap: vi.fn(),
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
    setTrails() {}
  },
}));

function click(point: Position) {
  mocks.handlers.get('click')?.({
    lngLat: { lng: point[0], lat: point[1] },
    originalEvent: { target: document.createElement('canvas') },
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
  mocks.plan = EMPTY_PLAN;
  mocks.write.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('route waypoint network races', () => {
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
