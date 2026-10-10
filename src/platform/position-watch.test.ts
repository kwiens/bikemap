import { describe, it, expect, vi } from 'vitest';
import { createPositionWatch, LIVE_FIX_OPTIONS } from './position-watch';
import type { GeolocationService, PositionError, PositionFix } from './types';

const FIX: PositionFix = {
  lng: -85.3,
  lat: 35.0,
  accuracy: 5,
  altitude: 200,
  altitudeAccuracy: 5,
  speed: 3,
  heading: 90,
  timestamp: 1_000,
};

function fakeGeolocation() {
  let onFix: ((fix: PositionFix) => void) | null = null;
  let onError: ((error: PositionError) => void) | null = null;
  const stop = vi.fn();
  const service: GeolocationService = {
    isSupported: () => true,
    watchPosition: vi.fn((fix, error) => {
      onFix = fix;
      onError = error;
      return stop;
    }),
    getCurrentPosition: vi.fn().mockResolvedValue(FIX),
  };
  return {
    service,
    stop,
    emit: (fix: PositionFix) => onFix?.(fix),
    fail: (error: PositionError) => onError?.(error),
  };
}

describe('createPositionWatch', () => {
  it('starts the underlying watch on the first subscriber and stops on the last', () => {
    const geo = fakeGeolocation();
    const watch = createPositionWatch(geo.service);

    const offA = watch.subscribe(() => {});
    const offB = watch.subscribe(() => {});
    expect(geo.service.watchPosition).toHaveBeenCalledTimes(1);
    expect(geo.service.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      LIVE_FIX_OPTIONS,
    );

    offA();
    expect(geo.stop).not.toHaveBeenCalled();
    offB();
    expect(geo.stop).toHaveBeenCalledTimes(1);
    // Unsubscribing twice is harmless.
    offB();
    expect(geo.stop).toHaveBeenCalledTimes(1);
  });

  it('fans fixes and errors out to every subscriber and remembers the latest fix', () => {
    const geo = fakeGeolocation();
    const watch = createPositionWatch(geo.service);
    const fixesA: PositionFix[] = [];
    const fixesB: PositionFix[] = [];
    const errors: PositionError[] = [];
    watch.subscribe((fix) => fixesA.push(fix));
    watch.subscribe(
      (fix) => fixesB.push(fix),
      (error) => errors.push(error),
    );

    expect(watch.latest()).toBeNull();
    geo.emit(FIX);
    geo.fail({ code: 'timeout', message: 'slow' });

    expect(fixesA).toEqual([FIX]);
    expect(fixesB).toEqual([FIX]);
    expect(errors).toEqual([{ code: 'timeout', message: 'slow' }]);
    expect(watch.latest()).toEqual(FIX);
  });

  it('restarts cleanly after the last subscriber leaves', () => {
    const geo = fakeGeolocation();
    const watch = createPositionWatch(geo.service);
    watch.subscribe(() => {})();
    expect(watch.latest()).toBeNull();
    watch.subscribe(() => {});
    expect(geo.service.watchPosition).toHaveBeenCalledTimes(2);
  });

  it('returns a requested fix without broadcasting it', async () => {
    const geo = fakeGeolocation();
    const watch = createPositionWatch(geo.service);
    const seen: PositionFix[] = [];
    watch.subscribe((fix) => seen.push(fix));

    const options = { highAccuracy: false, maximumAgeMs: 60_000 };
    await expect(watch.requestFix(options)).resolves.toEqual(FIX);
    expect(geo.service.getCurrentPosition).toHaveBeenCalledWith(options);
    expect(seen).toEqual([]);
  });
});
