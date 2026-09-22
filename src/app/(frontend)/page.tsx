/**
 * The public map, rendered on the server so trail content comes from Payload.
 *
 * This is a server component: it reads the database through Payload's Local
 * API (a typed function call, no HTTP hop) and hands the result to the client
 * map as props. An editor's change is live on the next request, with no
 * rebuild and no client-side fetch waterfall.
 *
 * If there is no database — or it's unreachable — `getCityTrailSummaries`
 * returns an empty list and the client falls back to the checked-in data in
 * `src/data/`. The public map keeps working either way.
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { getRequestHostname } from '@/utils/request-hostname';
import { resolveActiveCityId } from '@/config/map.config';
import { siteConfigForHostname } from '@/config/site.config';
import { getCityTrailSummaries } from '@/payload/read/trails';
import { getCityRoutes } from '@/payload/read/routes';
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
  const [{ trails }, { routes }] = await Promise.all([
    getCityTrailSummaries(cityId),
    getCityRoutes(cityId),
  ]);

  return <HomeClient cityId={cityId} routes={routes} trails={trails} />;
}
