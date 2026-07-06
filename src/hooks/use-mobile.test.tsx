import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  const listeners: Record<string, (() => void)[]> = {};

  function mockMatchMedia(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches,
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        }),
        removeEventListener: vi.fn(),
      }),
    });
  }

  afterEach(() => {
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
  });

  it('returns false when window width is >= 768', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024,
    });
    mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when window width is < 768', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 500,
    });
    mockMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when media query fires change event', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024,
    });
    mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 500,
    });
    act(() => {
      for (const cb of listeners.change || []) cb();
    });
    expect(result.current).toBe(true);
  });
});
