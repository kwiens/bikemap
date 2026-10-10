import type { HeadingService } from '../types';

type OrientationEventWithCompass = DeviceOrientationEvent & {
  /** Safari's true compass heading; `alpha` there is relative to page load. */
  webkitCompassHeading?: number;
};

type OrientationEventConstructor = {
  requestPermission?: () => Promise<string>;
};

/** Magnetic heading from an orientation event, or null when it carries none. */
function compassHeadingOf(event: DeviceOrientationEvent): number | null {
  const withCompass = event as OrientationEventWithCompass;
  if (typeof withCompass.webkitCompassHeading === 'number') {
    return withCompass.webkitCompassHeading;
  }
  if (typeof event.alpha === 'number') {
    return (360 - event.alpha) % 360;
  }
  return null;
}

export function createWebHeading(): HeadingService {
  const isSupported = () =>
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  return {
    isSupported,

    async requestPermission() {
      if (!isSupported()) return false;
      const ctor =
        DeviceOrientationEvent as unknown as OrientationEventConstructor;
      // Only iOS Safari has the prompt; elsewhere readings just arrive.
      if (!ctor.requestPermission) return true;
      try {
        return (await ctor.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    },

    watchHeading(onHeading) {
      if (!isSupported()) return () => {};
      const handler = (event: Event) => {
        const heading = compassHeadingOf(event as DeviceOrientationEvent);
        if (heading !== null) onHeading(heading);
      };
      // The absolute variant is north-referenced where it exists (Android
      // Chrome); the plain event is the fallback and the only one on iOS.
      const eventNames = [
        ...('ondeviceorientationabsolute' in window
          ? ['deviceorientationabsolute']
          : []),
        'deviceorientation',
      ];
      for (const name of eventNames) window.addEventListener(name, handler);
      return () => {
        for (const name of eventNames)
          window.removeEventListener(name, handler);
      };
    },
  };
}
