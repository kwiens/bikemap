/**
 * The public map, rendered on the server so trail content comes from Payload.
 *
 * This is a server component: it reads the database through Payload's Local
 * API (a typed function call, no HTTP hop) and hands the result to the client
 * map as props. An editor's change is live on the next request, with no
 * rebuild and no client-side fetch waterfall.
 *
 * If there is no database — or it's unreachable — `getCityTrails` returns an
 * empty list and the client falls back to the checked-in data in `src/data/`.
 * The public map keeps working either way.
 */
import type { ReactElement } from 'react';
import { getRequestHostname } from '@/utils/request-hostname';
import { resolveActiveCityId } from '@/config/map.config';
import { getCityTrails } from '@/payload/read/trails';
import HomeClient from './HomeClient';

// Rendered per request, because reading the hostname makes it so. One
// deployment can serve several cities (NEXT_PUBLIC_CITY_HOST_MAP), and a
// render cached across hosts would hand a visitor another city's trails. The
// resolved city travels with them so the client can reject a mismatch.
export default async function Home(): Promise<ReactElement> {
  const cityId = resolveActiveCityId(await getRequestHostname());
  const { trails } = await getCityTrails(cityId);

  return <HomeClient cityId={cityId} trails={trails} />;
}
