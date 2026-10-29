/** @vitest-environment jsdom */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from './native/protocol';

interface HostGlobals {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __bikemapNative?: Record<string, unknown>;
}

const hostWindow = window as unknown as HostGlobals;

afterEach(() => {
  cleanup();
  delete hostWindow.ReactNativeWebView;
  delete hostWindow.__bikemapNative;
});

describe('usePlatform detection', () => {
  it('uses a late host without replacing services captured during render', async () => {
    vi.resetModules();
    const { usePlatform } = await import('./context');
    const { result, rerender } = renderHook(() => usePlatform());
    const services = result.current;
    const positions = services.positions;
    expect(services.kind).toBe('web');
    services.geolocation.isSupported();

    const postMessage = vi.fn();
    hostWindow.ReactNativeWebView = { postMessage };
    hostWindow.__bikemapNative = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { geolocation: true, keepAwake: true, heading: true },
    };
    rerender();
    expect(result.current).toBe(services);
    expect(result.current.kind).toBe('native');
    const stop = positions.subscribe(vi.fn());
    expect(JSON.parse(postMessage.mock.calls[0][0]).type).toBe(
      'geolocation/watch',
    );
    stop();
    expect(JSON.parse(postMessage.mock.calls[1][0]).type).toBe(
      'geolocation/clearWatch',
    );
  });

  it('keeps a running browser session on the same backend after a late announcement', async () => {
    vi.resetModules();
    const watchPosition = vi.fn(() => 42);
    const clearWatch = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
    try {
      const { usePlatform } = await import('./context');
      const { result } = renderHook(() => usePlatform());
      const stop = result.current.positions.subscribe(vi.fn());
      const postMessage = vi.fn();
      hostWindow.ReactNativeWebView = { postMessage };
      hostWindow.__bikemapNative = {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { geolocation: true, keepAwake: true, heading: true },
      };
      expect(result.current.kind).toBe('web');
      const stopSecond = result.current.positions.subscribe(vi.fn());
      stop();
      stopSecond();
      expect(watchPosition).toHaveBeenCalledTimes(1);
      expect(clearWatch).toHaveBeenCalledWith(42);
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { version: undefined, kind: 'web' },
    { version: PROTOCOL_VERSION, kind: 'native' },
    { version: PROTOCOL_VERSION + 1, kind: 'web' },
  ])('uses $kind for host version $version', async ({ version, kind }) => {
    vi.resetModules();
    if (version !== undefined) {
      hostWindow.ReactNativeWebView = { postMessage: vi.fn() };
      hostWindow.__bikemapNative = {
        protocolVersion: version,
        capabilities: { geolocation: true, keepAwake: true, heading: true },
      };
    }
    const { usePlatform } = await import('./context');
    const { result, rerender } = renderHook(() => usePlatform());
    expect(result.current.kind).toBe(kind);
    const services = result.current;
    rerender();
    expect(result.current).toBe(services);
  });
});
