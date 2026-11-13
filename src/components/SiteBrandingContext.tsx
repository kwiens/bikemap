'use client';

import type { CityId } from '@/data/cities/types';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface SiteBranding {
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

  return (
    <UploadedLogo
      key={branding.logoUrl}
      url={branding.logoUrl}
      alt={branding.logoAlt ?? alt}
      className={className}
    >
      {children}
    </UploadedLogo>
  );
}

function UploadedLogo({
  url,
  alt,
  className,
  children,
}: {
  url: string;
  alt: string;
  className: string;
  children?: ReactNode;
}) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) return children ?? null;

  // The caller controls the bounding box while the SVG keeps its aspect ratio.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logos do not have fixed dimensions.
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setHasFailed(true)}
    />
  );
}
