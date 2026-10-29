'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createDetectedPlatform } from './detected';
import type { PlatformServices } from './types';

// Hosts and tests may supply services; the public app uses a lazy, stable
// facade so the first render cannot permanently select the browser backend.
const PlatformContext = createContext<PlatformServices | null>(null);

let detectedPlatform: PlatformServices | null = null;

function defaultPlatform(): PlatformServices {
  if (!detectedPlatform) {
    detectedPlatform = createDetectedPlatform();
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
