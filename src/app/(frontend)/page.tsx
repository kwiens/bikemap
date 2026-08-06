/**
 * The public map, rendered on the server so trail content comes from Payload.
 *
 * This is a server component: it reads the database through Payload's Local
 * API (a typed function call, no HTTP hop) and hands the result to the client
 * map as props. An editor's change is live on the next revalidation, with no
 * rebuild and no client-side fetch waterfall.
 *
 * If there is no database — or it's unreachable — `getCityTrails` returns an
 * empty list and the client falls back to the checked-in data in `src/data/`.
 * The public map keeps working either way.
 */
import type { ReactElement } from 'react';
import { activeCityId } from '@/config/map.config';
import { getCityTrails } from '@/payload/read/trails';
import HomeClient from './HomeClient';

// Trail edits are rare and the payload is a few hundred rows, so serve a cached
// render and refresh it in the background rather than hitting the database on
// every request.
export const revalidate = 60;

export default async function Home(): Promise<ReactElement> {
  const { trails } = await getCityTrails(activeCityId);

  return <HomeClient trails={trails} />;
}
