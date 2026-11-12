import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfigs } from '@/config/site.config';
import type { CityId } from '@/data/cities/types';
import { getFrontendTheme } from '@/payload/read/theme';
import { readLogoSvg, SVG_MIME_TYPE } from './logo-svg';

export const SITE_ICON_SIZES = [32, 180, 192, 512] as const;
export type SiteIconSize = (typeof SITE_ICON_SIZES)[number];

const defaultLogos = {
  chattanooga: 'Bike-Chatt_Logo-primary-blue-green.svg',
  bend: 'Ride-Bend_Icon.svg',
} satisfies Record<CityId, string>;

export async function renderSiteIcon(
  cityId: CityId,
  size: SiteIconSize,
  isMaskable = false,
): Promise<Response> {
  const { branding } = await getFrontendTheme();
  const logoUrl = branding[cityId]?.logoUrl;
  const artwork = logoUrl ? await loadUploadedLogo(logoUrl) : undefined;
  const logo =
    artwork ??
    (await readFile(
      path.join(process.cwd(), 'public', defaultLogos[cityId]),
      'utf8',
    ));
  const background = siteConfigs[cityId].backgroundColor;
  // A square occupying 56% of the canvas fits inside the maskable safe circle.
  const inset = isMaskable ? 22 : 0;
  const logoSize = 100 - 2 * inset;
  // Embedding the vector isolates its styles and keeps the icon self-contained.
  const image = Buffer.from(logo).toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${background}"/><image x="${inset}" y="${inset}" width="${logoSize}" height="${logoSize}" href="data:${SVG_MIME_TYPE};base64,${image}"/></svg>`;
  return new Response(svg, {
    headers: {
      'Content-Type': SVG_MIME_TYPE,
      'Content-Security-Policy': "default-src 'none'; img-src data:; sandbox",
      'X-Content-Type-Options': 'nosniff',
      // Failed uploads must recover immediately; replacements get a new URL.
      'Cache-Control': artwork
        ? 'public, max-age=3600, must-revalidate'
        : 'no-store',
    },
  });
}

async function loadUploadedLogo(url: string): Promise<string | undefined> {
  try {
    return readLogoSvg(await readLogo(url));
  } catch (error) {
    console.error(
      'Could not render city icon; using existing branding.',
      error,
    );
    return undefined;
  }
}

async function readLogo(url: string): Promise<Buffer> {
  if (url.startsWith('/')) {
    // Payload uses the same media proxy URL for disk and Blob uploads.
    const filename = path.basename(
      decodeURIComponent(new URL(url, 'http://local').pathname),
    );
    const storeId = process.env.BLOB_READ_WRITE_TOKEN?.match(
      /^vercel_blob_rw_([a-z\d]+)_[a-z\d]+$/i,
    )?.[1];
    if (!storeId) {
      return readFile(path.join(process.cwd(), 'public/media', filename));
    }

    const blobOrigin =
      process.env.STORAGE_VERCEL_BLOB_BASE_URL ||
      `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
    url = `${blobOrigin.replace(/\/$/, '')}/${encodeURIComponent(filename)}`;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Logo fetch returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
