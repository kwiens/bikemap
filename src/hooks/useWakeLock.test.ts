import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function createMockLock() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    released: false,
    release: vi.fn(function (this: { released: boolean }) {
      this.released = true;
      for (const fn of listeners.release ?? []) fn();
    }),
    addEventListener: vi.fn(
      (event: string, fn: () => void) =>
        (listeners[event] = [...(listeners[event] ?? []), fn]),
    ),
    // Helper to simulate OS-initiated release (e.g. Android backgrounding)
    _simulateOSRelease() {
      this.released = true;
      for (const fn of listeners.release ?? []) fn();
    },
  };
}

type MockLock = ReturnType<typeof createMockLock>;

describe('useWakeLock', () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let currentLock: MockLock;

  beforeEach(() => {
    currentLock = createMockLock();
    requestMock = vi.fn().mockResolvedValue(currentLock);

    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acquires wake lock when active=true', async () => {
    renderHook(() => useWakeLock(true));

    // Let the promise resolve
    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith('screen');
    });
  });

  it('does not acquire wake lock when active=false', () => {
    renderHook(() => useWakeLock(false));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('releases wake lock when active transitions to false', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });

    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    rerender({ active: false });

    expect(currentLock.release).toHaveBeenCalled();
  });

  it('releases wake lock on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));

    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    unmount();

    expect(currentLock.release).toHaveBeenCalled();
  });

  it('re-acquires wake lock on visibilitychange after OS release', async () => {
    renderHook(() => useWakeLock(true));

    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    // Simulate OS releasing the lock (Android backgrounding)
    currentLock._simulateOSRelease();

    // Prepare a fresh lock for re-acquisition
    const freshLock = createMockLock();
    requestMock.mockResolvedValue(freshLock);

    // Simulate page becoming visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(2);
    });
  });

  it('does not re-acquire if lock is still held on visibilitychange', async () => {
    renderHook(() => useWakeLock(true));

    await vi.waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    // Lock is still valid (not released) — simulate page returning
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Should not request again — still holding the lock
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('does not acquire if navigator.wakeLock is not available', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Should not throw
    renderHook(() => useWakeLock(true));
    expect(requestMock).not.toHaveBeenCalled();
  });
});
