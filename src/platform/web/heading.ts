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

/**
 * Which orientation event carries a north-referenced heading. Android Chrome
 * has `deviceorientationabsolute`; its plain `deviceorientation` reports
 * `alpha` relative to an arbitrary start, so listening to both would mix a
 * compass with a gyro and the smoother would average them. iOS has only the
 * plain event, with `webkitCompassHeading` on it.
 */
function headingEventName(): string {
  return 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute'
    : 'deviceorientation';
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
      const eventName = headingEventName();
      window.addEventListener(eventName, handler);
      return () => window.removeEventListener(eventName, handler);
    },
  };
}
