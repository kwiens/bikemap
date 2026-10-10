/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebKeepAwake } from './keep-awake';

function createMockLock() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    released: false,
    release: vi.fn(function (this: { released: boolean }) {
      this.released = true;
      for (const fn of listeners.release ?? []) fn();
      return Promise.resolve();
    }),
    addEventListener: vi.fn(
      (event: string, fn: () => void) =>
        (listeners[event] = [...(listeners[event] ?? []), fn]),
    ),
    removeEventListener: vi.fn(),
    // Simulates an OS-initiated release (Android battery optimisation).
    _simulateOSRelease() {
      this.released = true;
      for (const fn of listeners.release ?? []) fn();
    },
  };
}

type MockLock = ReturnType<typeof createMockLock>;

describe('createWebKeepAwake', () => {
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
    vi.useRealTimers();
  });

  it('requests a screen lock on acquire and releases it on release', async () => {
    const service = createWebKeepAwake();
    const release = service.acquire();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledWith('screen'));

    release();
    expect(currentLock.release).toHaveBeenCalled();
  });

  it('shares one lock between holders and releases when the last lets go', async () => {
    const service = createWebKeepAwake();
    const releaseTracking = service.acquire();
    const releaseRecording = service.acquire();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    releaseTracking();
    expect(currentLock.release).not.toHaveBeenCalled();
    releaseRecording();
    expect(currentLock.release).toHaveBeenCalledTimes(1);
    // A second call on the same handle is a no-op.
    releaseRecording();
    expect(currentLock.release).toHaveBeenCalledTimes(1);
  });

  it('re-acquires after a delay when the OS releases it', async () => {
    vi.useFakeTimers();
    const service = createWebKeepAwake();
    service.acquire();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    requestMock.mockResolvedValue(createMockLock());
    currentLock._simulateOSRelease();
    expect(requestMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
  });

  it('does not re-request while the lock is still held on visibilitychange', async () => {
    const service = createWebKeepAwake();
    service.acquire();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that resolved after every holder let go', async () => {
    let resolveRequest: (lock: MockLock) => void = () => {};
    requestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const service = createWebKeepAwake();
    const release = service.acquire();
    release();
    resolveRequest(currentLock);
    await vi.waitFor(() => expect(currentLock.release).toHaveBeenCalled());
  });

  it('is a no-op without the Wake Lock API', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const service = createWebKeepAwake();
    expect(service.isSupported()).toBe(false);
    const release = service.acquire();
    release();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
