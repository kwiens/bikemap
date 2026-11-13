/**
 * The public map, rendered on the server so trail content comes from Payload.
 *
 * This is a server component: it reads the database through Payload's Local
 * API (a typed function call, no HTTP hop) and hands the result to the client
 * map as props. An editor's change is live on the next request, with no
 * rebuild and no client-side fetch waterfall.
 *
 * If the database is unavailable, the map still has static trail and
 * attraction data. Casual route summaries depend on published Payload routes.
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { getRequestHostname } from '@/utils/request-hostname';
import { resolveActiveCityId } from '@/config/map.config';
import { siteConfigForHostname } from '@/config/site.config';
import { getCityContent } from '@/payload/read/city-content';
import HomeClient from './HomeClient';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[] }>;
}): Promise<Metadata> {
  const [hostname, query] = await Promise.all([
    getRequestHostname(),
    searchParams,
  ]);
  const config = siteConfigForHostname(hostname, query.city);

  return {
    title: config.name,
    description: config.description,
    alternates: {
      canonical: config.url,
    },
  };
}

// Rendered per request, because reading the hostname makes it so. One
// deployment can serve several cities (NEXT_PUBLIC_CITY_HOST_MAP), and a
// render cached across hosts would hand a visitor another city's trails. The
// resolved city travels with them so the client can reject a mismatch.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[] }>;
}): Promise<ReactElement> {
  const [hostname, query] = await Promise.all([
    getRequestHostname(),
    searchParams,
  ]);
  const cityId = resolveActiveCityId(hostname, query.city);
  const content = await getCityContent(cityId);

  return <HomeClient content={content} />;
}
