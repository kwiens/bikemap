/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MAP_EVENTS } from '@/events';
import {
  getLayout,
  initLayout,
  isMobileViewport,
  setRidesPanelOpen,
  setSidebarOpen,
  toggleRidesPanel,
  toggleSidebar,
  useLayout,
} from './useLayout';

vi.mock('@/utils/settings', () => ({
  setSetting: vi.fn(),
}));

function recordEvents() {
  const events: Array<{ type: string; isOpen: boolean }> = [];
  const handler = (e: Event) =>
    events.push({ type: e.type, isOpen: (e as CustomEvent).detail.isOpen });
  window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handler);
  window.addEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
  return {
    events,
    stop() {
      window.removeEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handler);
      window.removeEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    },
  };
}

describe('layout store', () => {
  beforeEach(() => {
    initLayout();
    vi.clearAllMocks();
  });

  it('seeds without dispatching', () => {
    const rec = recordEvents();
    initLayout({ sidebarOpen: false });
    rec.stop();
    expect(getLayout()).toEqual({ sidebarOpen: false, ridesPanelOpen: false });
    expect(rec.events).toEqual([]);
  });

  it('dispatches a toggle event only when the flag actually changes', () => {
    const rec = recordEvents();
    setSidebarOpen(true); // already open
    setSidebarOpen(false);
    setSidebarOpen(false);
    rec.stop();
    expect(rec.events).toEqual([{ type: 'sidebar-toggle', isOpen: false }]);
  });

  it('keeps the two panels mutually exclusive, closing before opening', () => {
    const rec = recordEvents();
    setRidesPanelOpen(true);
    expect(getLayout()).toEqual({ sidebarOpen: false, ridesPanelOpen: true });
    setSidebarOpen(true);
    expect(getLayout()).toEqual({ sidebarOpen: true, ridesPanelOpen: false });
    rec.stop();
    expect(rec.events).toEqual([
      { type: 'sidebar-toggle', isOpen: false },
      { type: 'rides-panel-toggle', isOpen: true },
      { type: 'rides-panel-toggle', isOpen: false },
      { type: 'sidebar-toggle', isOpen: true },
    ]);
  });

  it('toggles', () => {
    toggleSidebar();
    expect(getLayout().sidebarOpen).toBe(false);
    toggleRidesPanel();
    expect(getLayout().ridesPanelOpen).toBe(true);
    toggleRidesPanel();
    expect(getLayout().ridesPanelOpen).toBe(false);
  });

  it('persists the sidebar only when asked', async () => {
    const { setSetting } = await import('@/utils/settings');
    setSidebarOpen(false);
    expect(setSetting).not.toHaveBeenCalled();
    setSidebarOpen(true, { persist: true });
    expect(setSetting).toHaveBeenCalledWith('sidebarOpen', true);
    // Opening the rides panel closes the sidebar as a consequence, never as a
    // preference.
    setRidesPanelOpen(true);
    expect(setSetting).toHaveBeenCalledTimes(1);
  });

  it('useLayout re-renders subscribers on change', () => {
    const { result } = renderHook(() => useLayout());
    expect(result.current.sidebarOpen).toBe(true);
    act(() => setSidebarOpen(false));
    expect(result.current.sidebarOpen).toBe(false);
    act(() => setRidesPanelOpen(true));
    expect(result.current.ridesPanelOpen).toBe(true);
  });

  it('treats widths below the md breakpoint as mobile', () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      value: 767,
      configurable: true,
    });
    expect(isMobileViewport()).toBe(true);
    Object.defineProperty(window, 'innerWidth', {
      value: 768,
      configurable: true,
    });
    expect(isMobileViewport()).toBe(false);
    Object.defineProperty(window, 'innerWidth', {
      value: original,
      configurable: true,
    });
  });
});
