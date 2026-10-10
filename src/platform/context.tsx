'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createNativePlatform } from './native/services';
import { detectNativeHost } from './native/transport';
import type { PlatformServices } from './types';
import { createWebPlatform } from './web';

// Without a provider the platform is detected: the Expo shell announces itself
// by injecting `window.__bikemapNative` before the page loads (see
// docs/guides/native-shell.md), and anything else is the browser. The main app
// never mounts a provider; tests and other hosts can.
const PlatformContext = createContext<PlatformServices | null>(null);

let detectedPlatform: PlatformServices | null = null;

function defaultPlatform(): PlatformServices {
  if (!detectedPlatform) {
    const host = detectNativeHost();
    detectedPlatform = host ? createNativePlatform(host) : createWebPlatform();
  }
  return detectedPlatform;
}

export function PlatformProvider({
  services,
  children,
}: {
  services: PlatformServices;
  children: ReactNode;
}) {
  return (
    <PlatformContext.Provider value={services}>
      {children}
    </PlatformContext.Provider>
  );
}

/** The device services for this session. Stable for the life of the tree. */
export function usePlatform(): PlatformServices {
  return useContext(PlatformContext) ?? defaultPlatform();
}
