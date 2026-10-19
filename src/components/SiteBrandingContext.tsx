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

export function SiteLogo({
  className,
  alt,
  children,
}: {
  className: string;
  alt: string;
  children?: ReactNode;
}) {
  const { logoAlt, logoUrl } = useContext(SiteBrandingContext);

  if (!logoUrl) return children ?? null;

  // Payload accepts only raster images. Uploaded dimensions vary, so the
  // caller controls the bounding box while the natural aspect ratio is kept.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logos do not have fixed dimensions.
    <img src={logoUrl} alt={logoAlt ?? alt} className={className} />
  );
}
