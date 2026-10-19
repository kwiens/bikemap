import 'server-only';

import { createHash } from 'node:crypto';
import type { Metadata, MetadataRoute } from 'next';
import type { CityId } from '@/data/cities/types';
import { getFrontendTheme } from './theme';

/** Uploads receive unique URLs, so replacing a logo also changes every icon URL. */
export async function getSiteIcons(cityId: CityId): Promise<{
  icons: Metadata['icons'];
  manifestIcons: MetadataRoute.Manifest['icons'];
}> {
  const { branding } = await getFrontendTheme();
  const logoUrl = branding[cityId]?.logoUrl;
  const version = logoUrl
    ? createHash('sha256').update(logoUrl).digest('hex').slice(0, 16)
    : undefined;

  function iconUrl(size: number, fallback: string, isMaskable = false): string {
    if (!version) return fallback;
    const params = new URLSearchParams({
      city: cityId,
      size: String(size),
      v: version,
    });
    if (isMaskable) params.set('maskable', '1');
    return `/api/site-icon?${params}`;
  }

  const app192 = iconUrl(192, '/icon-192.png');
  const app512 = iconUrl(512, '/icon-512.png');
  return {
    icons: {
      icon: [
        { url: iconUrl(32, '/favicon.png'), sizes: '32x32', type: 'image/png' },
        { url: app192, sizes: '192x192', type: 'image/png' },
        { url: app512, sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        {
          url: iconUrl(180, '/apple-touch-icon.png'),
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    manifestIcons: [
      { src: app192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: app512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: iconUrl(512, '/icon-512.png', true),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
