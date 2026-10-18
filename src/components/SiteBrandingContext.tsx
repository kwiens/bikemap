'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface SiteBranding {
  logoAlt: string | null;
  logoUrl: string | null;
}

const DEFAULT_BRANDING: SiteBranding = {
  logoAlt: null,
  logoUrl: null,
};

const SiteBrandingContext = createContext<SiteBranding>(DEFAULT_BRANDING);

export function SiteBrandingProvider({
  branding,
  children,
}: {
  branding: SiteBranding;
  children: ReactNode;
}) {
  return (
    <SiteBrandingContext.Provider value={branding}>
      {children}
    </SiteBrandingContext.Provider>
  );
}

export function useSiteBranding(): SiteBranding {
  return useContext(SiteBrandingContext);
}

export function SiteLogo({
  className,
  fallbackAlt,
}: {
  className: string;
  fallbackAlt: string;
}) {
  const { logoAlt, logoUrl } = useSiteBranding();

  if (!logoUrl) return null;

  // Payload accepts only raster images. Uploaded dimensions vary, so the
  // caller controls the bounding box while the natural aspect ratio is kept.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logos do not have fixed dimensions.
    <img src={logoUrl} alt={logoAlt ?? fallbackAlt} className={className} />
  );
}
