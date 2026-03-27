import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapResize } from './useMapResize';

describe('useMapResize', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('adds resize and sidebar-toggle listeners on mount', () => {
    const map = { current: { resize: vi.fn() } } as never;
    renderHook(() => useMapResize({ map }));

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('sidebar-toggle', expect.any(Function));
  });

  it('removes listeners on unmount', () => {
    const map = { current: { resize: vi.fn() } } as never;
    const { unmount } = renderHook(() => useMapResize({ map }));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      'sidebar-toggle',
      expect.any(Function),
    );
  });

  it('calls map.resize on window resize event', () => {
    const resize = vi.fn();
    const map = { current: { resize } } as never;
    renderHook(() => useMapResize({ map }));

    window.dispatchEvent(new Event('resize'));

    expect(resize).toHaveBeenCalled();
  });

  it('calls map.resize after delay on sidebar-toggle event', () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const map = { current: { resize } } as never;
    renderHook(() => useMapResize({ map }));

    window.dispatchEvent(new Event('sidebar-toggle'));

    expect(resize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(resize).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('does not error when map.current is null', () => {
    const map = { current: null } as never;
    renderHook(() => useMapResize({ map }));

    expect(() => {
      window.dispatchEvent(new Event('resize'));
    }).not.toThrow();
  });
});
