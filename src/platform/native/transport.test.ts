/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PROTOCOL_VERSION } from './protocol';
import {
  createReactNativeWebViewTransport,
  detectNativeHost,
  isInsideNativeShell,
} from './transport';

type HostGlobals = {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __bikemapNative?: Record<string, unknown>;
};

const w = window as unknown as HostGlobals;

const HOST = {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { geolocation: true, keepAwake: true, heading: true },
};

describe('detectNativeHost', () => {
  afterEach(() => {
    delete w.ReactNativeWebView;
    delete w.__bikemapNative;
  });

  it('is null in a plain browser', () => {
    expect(detectNativeHost()).toBeNull();
  });

  it('needs both the WebView channel and compatible host info', () => {
    w.ReactNativeWebView = { postMessage: vi.fn() };
    expect(isInsideNativeShell()).toBe(false);
    expect(detectNativeHost()).toBeNull();
    w.__bikemapNative = { ...HOST, protocolVersion: PROTOCOL_VERSION + 1 };
    // An incompatible shell is still the shell (no install prompt there),
    // but its services are not used.
    expect(isInsideNativeShell()).toBe(true);
    expect(detectNativeHost()).toBeNull();
    w.__bikemapNative = { ...HOST };
    expect(detectNativeHost()).toEqual(HOST);
  });
});

describe('createReactNativeWebViewTransport', () => {
  afterEach(() => {
    delete w.ReactNativeWebView;
    delete w.__bikemapNative;
  });

  it('posts encoded commands to the WebView channel', () => {
    const postMessage = vi.fn();
    w.ReactNativeWebView = { postMessage };
    const transport = createReactNativeWebViewTransport();
    transport.send({ type: 'heading/watch' });
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      source: 'bikemap',
      v: PROTOCOL_VERSION,
      type: 'heading/watch',
    });
  });

  it('delivers host events via receive() and message events, keeping the injected info', () => {
    w.__bikemapNative = { ...HOST };
    const transport = createReactNativeWebViewTransport();
    const seen: unknown[] = [];
    const off = transport.onEvent((event) => seen.push(event));

    const reading = {
      source: 'bikemap',
      v: PROTOCOL_VERSION,
      type: 'heading/reading',
      headingDegrees: 10,
    };
    expect(w.__bikemapNative.protocolVersion).toBe(PROTOCOL_VERSION);
    (w.__bikemapNative.receive as (data: string) => void)(
      JSON.stringify(reading),
    );
    window.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(reading) }),
    );
    document.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(reading) }),
    );
    // Unrelated traffic on the channel is ignored, and so is a well-formed
    // message posted by another window (an iframe), which carries a source.
    window.dispatchEvent(new MessageEvent('message', { data: 'hello' }));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify(reading),
        source: window,
      }),
    );
    const event = { type: 'heading/reading', headingDegrees: 10 };
    expect(seen).toEqual([event, event, event]);

    off();
    (w.__bikemapNative.receive as (data: string) => void)(
      JSON.stringify(reading),
    );
    expect(seen).toHaveLength(3);
  });
});
