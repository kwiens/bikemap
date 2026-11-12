import 'server-only';

import { createHash } from 'node:crypto';
import type { Metadata, MetadataRoute } from 'next';
import type { CityId } from '@/data/cities/types';
import { SVG_MIME_TYPE } from '@/utils/logo-svg';
import { getFrontendTheme } from './theme';

/** Uploads receive unique URLs, so replacing a logo also changes every icon URL. */
export async function getSiteIcons(cityId: CityId): Promise<{
  icons: Metadata['icons'];
  manifestIcons: MetadataRoute.Manifest['icons'];
}> {
  const { branding } = await getFrontendTheme();
  const logoUrl = branding[cityId]?.logoUrl;
  const version = logoUrl
    ? createHash('sha256').update(`svg:${logoUrl}`).digest('hex').slice(0, 16)
    : undefined;

  function iconUrl(size: number, isMaskable = false): string {
    const params = new URLSearchParams({ city: cityId, size: String(size) });
    if (version) params.set('v', version);
    if (isMaskable) params.set('maskable', '1');
    return `/api/site-icon?${params}`;
  }

  return {
    icons: {
      icon: [{ url: iconUrl(32), sizes: 'any', type: SVG_MIME_TYPE }],
      apple: [{ url: iconUrl(180), sizes: '180x180', type: SVG_MIME_TYPE }],
    },
    manifestIcons: [
      {
        src: iconUrl(192),
        sizes: '192x192',
        type: SVG_MIME_TYPE,
        purpose: 'any',
      },
      {
        src: iconUrl(512),
        sizes: '512x512',
        type: SVG_MIME_TYPE,
        purpose: 'any',
      },
      {
        src: iconUrl(512, true),
        sizes: '512x512',
        type: SVG_MIME_TYPE,
        purpose: 'maskable',
      },
    ],
  };
}
