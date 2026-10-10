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
  // Handles taken during a test, released afterwards: a service whose holder
  // never lets go keeps its visibilitychange listener on `document` and would
  // answer the next test's events.
  const handles: Array<() => void> = [];
  const acquire = (service: ReturnType<typeof createWebKeepAwake>) => {
    const release = service.acquire();
    handles.push(release);
    return release;
  };

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
    for (const release of handles.splice(0)) release();
    vi.useRealTimers();
  });

  it('requests a screen lock on acquire and releases it on release', async () => {
    const service = createWebKeepAwake();
    const release = acquire(service);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledWith('screen'));

    release();
    expect(currentLock.release).toHaveBeenCalled();
  });

  it('shares one lock between holders and releases when the last lets go', async () => {
    const service = createWebKeepAwake();
    const releaseTracking = acquire(service);
    const releaseRecording = acquire(service);
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
    acquire(service);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    requestMock.mockResolvedValue(createMockLock());
    currentLock._simulateOSRelease();
    expect(requestMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
  });

  it('does not re-request while the lock is still held on visibilitychange', async () => {
    const service = createWebKeepAwake();
    acquire(service);
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('sends one request while a request is still pending', async () => {
    let resolveRequest: (lock: MockLock) => void = () => {};
    requestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const service = createWebKeepAwake();
    const release = acquire(service);
    // A visibility change and a holder leaving and returning both arrive
    // before the first request resolves.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    release();
    const releaseAgain = acquire(service);
    expect(requestMock).toHaveBeenCalledTimes(1);

    resolveRequest(currentLock);
    await vi.waitFor(() => expect(currentLock.release).not.toHaveBeenCalled());
    releaseAgain();
    expect(currentLock.release).toHaveBeenCalledTimes(1);
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
    const release = acquire(service);
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
    const release = acquire(service);
    release();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
