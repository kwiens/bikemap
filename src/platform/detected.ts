import { createNativePlatform } from './native/services';
import { detectNativeHost } from './native/transport';
import type { PlatformServices } from './types';
import { createWebPlatform } from './web';

/**
 * Rendering must not select device services: Android can announce the host
 * after the first render. Keep the facade stable and choose on the first
 * device action, then retain that backend so a live watch and its cleanup
 * always belong to the same implementation.
 */
export function createDetectedPlatform(): PlatformServices {
  let selected: PlatformServices | undefined;
  let web: PlatformServices | undefined;
  let native: PlatformServices | undefined;

  function available(): PlatformServices {
    if (selected) return selected;
    const host = detectNativeHost();
    if (host) return (native ??= createNativePlatform(host));
    return (web ??= createWebPlatform());
  }

  function select(): PlatformServices {
    return (selected ??= available());
  }

  return {
    get kind() {
      return selected?.kind ?? (detectNativeHost() ? 'native' : 'web');
    },
    geolocation: {
      isSupported: () => available().geolocation.isSupported(),
      watchPosition: (...args) => select().geolocation.watchPosition(...args),
      getCurrentPosition: (...args) =>
        select().geolocation.getCurrentPosition(...args),
    },
    positions: {
      subscribe: (...args) => select().positions.subscribe(...args),
      requestFix: (...args) => select().positions.requestFix(...args),
    },
    keepAwake: {
      isSupported: () => available().keepAwake.isSupported(),
      acquire: () => select().keepAwake.acquire(),
    },
    heading: {
      isSupported: () => available().heading.isSupported(),
      requestPermission: () => select().heading.requestPermission(),
      watchHeading: (...args) => select().heading.watchHeading(...args),
    },
    share: {
      isSupported: () => available().share.isSupported(),
      exportFile: (...args) => select().share.exportFile(...args),
      shareLink: (...args) => select().share.shareLink(...args),
    },
  };
}
