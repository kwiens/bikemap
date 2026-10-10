/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PositionFix } from '../types';
import { PROTOCOL_VERSION, type HostCommand, type PageEvent } from './protocol';
import { createNativePlatform } from './services';
import type { BridgeTransport } from './transport';

const FIX: PositionFix = {
  lng: -121.3,
  lat: 44.05,
  accuracy: 4,
  altitude: 1100,
  altitudeAccuracy: 3,
  speed: 5,
  heading: 270,
  timestamp: 42,
};

function fakeTransport() {
  const sent: HostCommand[] = [];
  const handlers = new Set<(event: PageEvent) => void>();
  const transport: BridgeTransport = {
    send: (command) => sent.push(command),
    onEvent: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  return {
    transport,
    sent,
    emit(event: PageEvent) {
      for (const handler of handlers) handler(event);
    },
  };
}

const ALL = {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: {
    geolocation: true,
    keepAwake: true,
    heading: true,
    share: true,
  },
};

describe('createNativePlatform', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes a position watch over the bridge and clears it on unsubscribe', () => {
    const bridge = fakeTransport();
    const platform = createNativePlatform(ALL, bridge.transport);
    const fixes: PositionFix[] = [];
    const errors: string[] = [];
    const stop = platform.positions.subscribe(
      (fix) => fixes.push(fix),
      (error) => errors.push(error.code),
    );

    expect(bridge.sent[0]).toMatchObject({
      type: 'geolocation/watch',
      watchId: 1,
    });
    bridge.emit({ type: 'geolocation/fix', watchId: 1, fix: FIX });
    bridge.emit({ type: 'geolocation/fix', watchId: 2, fix: FIX }); // not ours
    bridge.emit({
      type: 'geolocation/error',
      watchId: 1,
      error: { code: 'permission-denied', message: '' },
    });
    expect(fixes).toEqual([FIX]);
    expect(errors).toEqual(['permission-denied']);

    stop();
    expect(bridge.sent.at(-1)).toEqual({
      type: 'geolocation/clearWatch',
      watchId: 1,
    });
  });

  it('answers getCurrentPosition from the matching response and times out otherwise', async () => {
    vi.useFakeTimers();
    const bridge = fakeTransport();
    const platform = createNativePlatform(ALL, bridge.transport);

    const first = platform.positions.requestFix({ maximumAgeMs: 60_000 });
    expect(bridge.sent[0]).toMatchObject({
      type: 'geolocation/getCurrent',
      requestId: 1,
      options: { maximumAgeMs: 60_000 },
    });
    bridge.emit({ type: 'geolocation/current', requestId: 1, fix: FIX });
    await expect(first).resolves.toEqual(FIX);

    const second = platform.positions.requestFix();
    bridge.emit({
      type: 'geolocation/currentError',
      requestId: 2,
      error: { code: 'unavailable', message: 'no provider' },
    });
    await expect(second).rejects.toMatchObject({ code: 'unavailable' });

    // The page waits the GPS budget plus bridge slack, so a host answering
    // right at its own deadline still counts.
    const third = platform.positions.requestFix({ timeoutMs: 1_000 });
    vi.advanceTimersByTime(1_000);
    bridge.emit({ type: 'geolocation/current', requestId: 3, fix: FIX });
    await expect(third).resolves.toEqual(FIX);

    const fourth = platform.positions.requestFix({ timeoutMs: 1_000 });
    vi.advanceTimersByTime(3_000);
    await expect(fourth).rejects.toMatchObject({ code: 'timeout' });
  });

  it('counts keep-awake holders so the host sees one acquire and one release', () => {
    const bridge = fakeTransport();
    const platform = createNativePlatform(ALL, bridge.transport);
    const releaseA = platform.keepAwake.acquire();
    const releaseB = platform.keepAwake.acquire();
    releaseA();
    releaseA();
    expect(bridge.sent).toEqual([{ type: 'keepAwake/acquire' }]);
    releaseB();
    expect(bridge.sent).toEqual([
      { type: 'keepAwake/acquire' },
      { type: 'keepAwake/release' },
    ]);
  });

  it('asks the host for compass permission and streams readings while watched', async () => {
    const bridge = fakeTransport();
    const platform = createNativePlatform(ALL, bridge.transport);

    const permission = platform.heading.requestPermission();
    expect(bridge.sent[0]).toEqual({
      type: 'heading/requestPermission',
      requestId: 1,
    });
    bridge.emit({ type: 'heading/permission', requestId: 1, granted: true });
    await expect(permission).resolves.toBe(true);

    const readings: number[] = [];
    const stop = platform.heading.watchHeading((deg) => readings.push(deg));
    expect(bridge.sent.at(-1)).toEqual({ type: 'heading/watch' });
    bridge.emit({ type: 'heading/reading', headingDegrees: 33 });
    stop();
    bridge.emit({ type: 'heading/reading', headingDegrees: 34 });
    expect(readings).toEqual([33]);
    expect(bridge.sent.at(-1)).toEqual({ type: 'heading/clearWatch' });
  });

  it('sends files and links to the share sheet and settles on the result', async () => {
    const bridge = fakeTransport();
    const platform = createNativePlatform(ALL, bridge.transport);

    const file = platform.share.exportFile({
      filename: 'ride.gpx',
      mimeType: 'application/gpx+xml',
      content: '<gpx/>',
    });
    expect(bridge.sent[0]).toEqual({
      type: 'share/file',
      requestId: 1,
      filename: 'ride.gpx',
      mimeType: 'application/gpx+xml',
      content: '<gpx/>',
    });
    bridge.emit({ type: 'share/result', requestId: 1, ok: true });
    await expect(file).resolves.toBe('shared');

    const link = platform.share.shareLink('https://bikechatt.com/?trail=x');
    expect(bridge.sent[1]).toEqual({
      type: 'share/link',
      requestId: 2,
      url: 'https://bikechatt.com/?trail=x',
    });
    bridge.emit({ type: 'share/result', requestId: 2, ok: false });
    await expect(link).resolves.toBe('failed');
  });

  it('keeps the browser implementation for capabilities the host does not claim', () => {
    const bridge = fakeTransport();
    const platform = createNativePlatform(
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { geolocation: true, keepAwake: false, heading: false },
      },
      bridge.transport,
    );
    expect(platform.kind).toBe('native');

    // Web keep-awake and heading never touch the bridge...
    platform.keepAwake.acquire()();
    platform.heading.watchHeading(() => {})();
    expect(bridge.sent).toEqual([]);
    // ...while geolocation does.
    platform.positions.subscribe(() => {})();
    expect(bridge.sent.map((command) => command.type)).toEqual([
      'geolocation/watch',
      'geolocation/clearWatch',
    ]);
  });
});
