'use client';

import type { CityId } from '@/data/cities/types';
import { createContext, useContext, type ReactNode } from 'react';

export interface SiteBranding {
  logoAlt: string | null;
  logoUrl: string | null;
}

export type CityBranding = Partial<Record<CityId, SiteBranding>>;

const SiteBrandingContext = createContext<CityBranding>({});

export function SiteBrandingProvider({
  branding,
  children,
}: {
  branding: CityBranding;
  children: ReactNode;
}) {
  return (
    <SiteBrandingContext.Provider value={branding}>
      {children}
    </SiteBrandingContext.Provider>
  );
}

export function SiteLogo({
  cityId,
  className,
  alt,
  children,
}: {
  cityId: CityId;
  className: string;
  alt: string;
  children?: ReactNode;
}) {
  const branding = useContext(SiteBrandingContext)[cityId];

  if (!branding?.logoUrl) return children ?? null;

  // Payload accepts only raster images. Uploaded dimensions vary, so the
  // caller controls the bounding box while the natural aspect ratio is kept.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logos do not have fixed dimensions.
    <img
      src={branding.logoUrl}
      alt={branding.logoAlt ?? alt}
      className={className}
    />
  );
}
