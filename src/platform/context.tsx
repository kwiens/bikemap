'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PlatformServices } from './types';
import { createWebPlatform } from './web';

// No provider means the browser. The main app never mounts one; a host that
// supplies native services (the Expo shell) wraps the map in PlatformProvider.
const PlatformContext = createContext<PlatformServices | null>(null);

let webPlatform: PlatformServices | null = null;

function defaultPlatform(): PlatformServices {
  webPlatform ??= createWebPlatform();
  return webPlatform;
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
