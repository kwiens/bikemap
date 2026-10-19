import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { siteConfigs } from '@/config/site.config';
import type { CityId } from '@/data/cities/types';
import { getFrontendTheme } from '@/payload/read/theme';

export const SITE_ICON_SIZES = [32, 180, 192, 512] as const;
export type SiteIconSize = (typeof SITE_ICON_SIZES)[number];

export async function renderSiteIcon(
  cityId: CityId,
  size: SiteIconSize,
  isMaskable = false,
): Promise<Response> {
  const { branding } = await getFrontendTheme();
  const logoUrl = branding[cityId]?.logoUrl;
  let image: Buffer;
  let hasUploadedLogo: boolean;
  try {
    if (!logoUrl) throw new Error('No city logo');
    image = await readLogo(logoUrl);
    const background = siteConfigs[cityId].backgroundColor;
    // A square occupying 56% of the canvas fits inside the maskable safe circle.
    const innerSize = isMaskable ? Math.floor(size * 0.56) : size;
    const padding = Math.floor((size - innerSize) / 2);
    image = await sharp(image, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(innerSize, innerSize, { fit: 'contain', background })
      .flatten({ background })
      .extend({
        top: padding,
        left: padding,
        bottom: size - innerSize - padding,
        right: size - innerSize - padding,
        background,
      })
      .png()
      .toBuffer();
    hasUploadedLogo = true;
  } catch (error) {
    if (logoUrl)
      console.error(
        'Could not render city icon; using existing branding.',
        error,
      );
    hasUploadedLogo = false;
    const file =
      size === 32
        ? 'favicon.png'
        : size === 180
          ? 'apple-touch-icon.png'
          : `icon-${size}.png`;
    image = await readFile(path.join(process.cwd(), 'public', file));
  }
  return new Response(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/png',
      // Failed uploads must recover immediately; replacements get a new URL.
      'Cache-Control': hasUploadedLogo
        ? 'public, max-age=3600, must-revalidate'
        : 'no-store',
    },
  });
}

async function readLogo(url: string): Promise<Buffer> {
  if (url.startsWith('/')) {
    // Local Payload uploads are served from /api/media/file/<filename>.
    // Resolve only a filename so an unexpected stored URL cannot read outside media.
    const filename = path.basename(
      decodeURIComponent(new URL(url, 'http://local').pathname),
    );
    return readFile(path.join(process.cwd(), 'public/media', filename));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Logo fetch returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
