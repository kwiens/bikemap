import type {
  GeolocationService,
  PositionError,
  PositionFix,
  PositionOptions,
  PositionWatch,
  Unsubscribe,
} from './types';

/** What both the location marker and the ride recorder asked for before they
 *  shared a watch: fresh, GPS-grade fixes. */
export const LIVE_FIX_OPTIONS: Required<PositionOptions> = {
  highAccuracy: true,
  maximumAgeMs: 0,
  timeoutMs: 5_000,
};

interface Subscriber {
  onFix: (fix: PositionFix) => void;
  onError?: (error: PositionError) => void;
}

export function createPositionWatch(
  geolocation: GeolocationService,
  options: PositionOptions = LIVE_FIX_OPTIONS,
): PositionWatch {
  const subscribers = new Set<Subscriber>();
  let stopWatch: Unsubscribe | null = null;
  let latest: PositionFix | null = null;

  function start() {
    stopWatch = geolocation.watchPosition(
      (fix) => {
        latest = fix;
        for (const subscriber of subscribers) subscriber.onFix(fix);
      },
      (error) => {
        for (const subscriber of subscribers) subscriber.onError?.(error);
      },
      options,
    );
  }

  function stop() {
    stopWatch?.();
    stopWatch = null;
    latest = null;
  }

  return {
    subscribe(onFix, onError) {
      const subscriber: Subscriber = { onFix, onError };
      subscribers.add(subscriber);
      if (subscribers.size === 1) start();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(subscriber);
        if (subscribers.size === 0) stop();
      };
    },
    latest: () => latest,
    requestFix: (fixOptions) => geolocation.getCurrentPosition(fixOptions),
  };
}
