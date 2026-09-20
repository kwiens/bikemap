import type { CityId } from '@/data/cities/types';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { siteConfigs } from '@/config/site.config';
import { parseElevationProfile } from '@/utils/elevation-profile';

/**
 * Reads the checked-in fallback through its public, canonical URL.
 *
 * Vercel serves `public/` separately from the Payload function, so reading it
 * with Node's filesystem APIs is not portable. The city URL is trusted config
 * rather than the incoming Host header, which also prevents an authenticated
 * request from turning this fetch into an arbitrary-origin proxy.
 */
export async function getBundledElevationProfile(
  city: CityId,
  slug: string,
): Promise<ElevationProfile | null> {
  const url = new URL(
    `/data/elevation/${city}/${encodeURIComponent(slug)}.json`,
    siteConfigs[city].url,
  );

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return parseElevationProfile(await response.json());
  } catch {
    return null;
  }
}
