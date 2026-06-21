import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteConfigForHostname } from '@/config/site.config';

// App Router serves this at /manifest.webmanifest and auto-injects the
// <link rel="manifest"> tag. Driven by site.config.ts so a fork rebrands
// the PWA without editing this file.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const siteConfig = siteConfigForHostname(await getRequestHostname());

  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: siteConfig.backgroundColor,
    theme_color: siteConfig.themeColor,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

async function getRequestHostname(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    return (
      requestHeaders.get('x-forwarded-host') ??
      requestHeaders.get('host') ??
      undefined
    );
  } catch {
    return undefined;
  }
}
