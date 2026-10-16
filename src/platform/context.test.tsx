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
