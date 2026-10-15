/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@/platform/native/protocol';
import { PwaInstallPrompt } from './PwaInstallPrompt';

interface HostGlobals {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __bikemapNative?: Record<string, unknown>;
}

const hostWindow = window as unknown as HostGlobals;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete hostWindow.ReactNativeWebView;
  delete hostWindow.__bikemapNative;
});

describe('PwaInstallPrompt', () => {
  it('shows installation instructions in an iOS browser', () => {
    render(<PwaInstallPrompt />);
    expect(screen.getByText(/Add .* to your home screen/)).toBeVisible();
  });

  it.each([PROTOCOL_VERSION, PROTOCOL_VERSION + 1])(
    'hides installation instructions inside a shell with protocol %s',
    (protocolVersion) => {
      hostWindow.ReactNativeWebView = { postMessage: vi.fn() };
      hostWindow.__bikemapNative = { protocolVersion, capabilities: {} };
      render(<PwaInstallPrompt />);
      expect(screen.queryByText(/Add .* to your home screen/)).toBeNull();
    },
  );
});
