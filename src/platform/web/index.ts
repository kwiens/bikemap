import { createPositionWatch } from '../position-watch';
import type { PlatformServices } from '../types';
import { createWebGeolocation } from './geolocation';
import { createWebHeading } from './heading';
import { createWebKeepAwake } from './keep-awake';

/** The browser implementation: what the public site and the PWA run on. */
export function createWebPlatform(): PlatformServices {
  const geolocation = createWebGeolocation();
  return {
    kind: 'web',
    geolocation,
    positions: createPositionWatch(geolocation),
    keepAwake: createWebKeepAwake(),
    heading: createWebHeading(),
  };
}
