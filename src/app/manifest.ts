import { getSiteIcons } from '@/payload/read/site-icons';
import type { MetadataRoute } from 'next';
import { siteConfigForHostname } from '@/config/site.config';
import { getRequestHostname } from '@/utils/request-hostname';

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
    icons: (await getSiteIcons(siteConfig.cityId)).manifestIcons,
  };
}
