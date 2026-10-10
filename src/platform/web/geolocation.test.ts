/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebGeolocation } from './geolocation';

function domPosition(): GeolocationPosition {
  return {
    coords: {
      longitude: -85.3,
      latitude: 35.0,
      accuracy: 8,
      altitude: 210,
      altitudeAccuracy: 4,
      speed: 2.5,
      heading: 180,
      toJSON: () => ({}),
    },
    timestamp: 1234,
    toJSON: () => ({}),
  };
}

describe('createWebGeolocation', () => {
  let watchPosition: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;
  let getCurrentPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    watchPosition = vi.fn().mockReturnValue(7);
    clearWatch = vi.fn();
    getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: { watchPosition, clearWatch, getCurrentPosition },
      writable: true,
      configurable: true,
    });
  });

  it('maps DOM positions to PositionFix and clears the watch on unsubscribe', () => {
    const service = createWebGeolocation();
    const fixes: unknown[] = [];
    const stop = service.watchPosition(
      (fix) => fixes.push(fix),
      () => {},
      { highAccuracy: true, maximumAgeMs: 0, timeoutMs: 5000 },
    );

    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
    );
    watchPosition.mock.calls[0][0](domPosition());
    expect(fixes).toEqual([
      {
        lng: -85.3,
        lat: 35.0,
        accuracy: 8,
        altitude: 210,
        altitudeAccuracy: 4,
        speed: 2.5,
        heading: 180,
        timestamp: 1234,
      },
    ]);

    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('maps DOM error codes', () => {
    const service = createWebGeolocation();
    const errors: unknown[] = [];
    service.watchPosition(
      () => {},
      (error) => errors.push(error.code),
    );
    const fail = watchPosition.mock.calls[0][1];
    fail({ code: 1, message: 'denied' });
    fail({ code: 2, message: 'unavailable' });
    fail({ code: 3, message: 'timeout' });
    expect(errors).toEqual(['permission-denied', 'unavailable', 'timeout']);
  });

  it('resolves a single fix and rejects with a PositionError', async () => {
    const service = createWebGeolocation();
    getCurrentPosition.mockImplementationOnce((ok: (p: unknown) => void) =>
      ok(domPosition()),
    );
    await expect(
      service.getCurrentPosition({ highAccuracy: false, maximumAgeMs: 60_000 }),
    ).resolves.toMatchObject({ lng: -85.3, lat: 35.0 });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5000 },
    );

    getCurrentPosition.mockImplementationOnce(
      (_ok: unknown, fail: (e: unknown) => void) =>
        fail({ code: 1, message: 'nope' }),
    );
    await expect(service.getCurrentPosition()).rejects.toEqual({
      code: 'permission-denied',
      message: 'nope',
    });
  });

  it('reports unavailable when the browser has no geolocation', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const service = createWebGeolocation();
    expect(service.isSupported()).toBe(false);
    const onError = vi.fn();
    service.watchPosition(() => {}, onError)();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'unavailable' }),
    );
    await expect(service.getCurrentPosition()).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});
