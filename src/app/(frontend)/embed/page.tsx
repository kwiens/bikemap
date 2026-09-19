import type { ReactElement } from 'react';
import React from 'react';
import { resolveActiveCityId } from '@/config/map.config';
import { getCityRoutes } from '@/payload/read/routes';
import { getRequestHostname } from '@/utils/request-hostname';
import EmbedClient from './EmbedClient';

export default async function EmbedPage(): Promise<ReactElement> {
  const cityId = resolveActiveCityId(await getRequestHostname());
  const { routes } = await getCityRoutes(cityId);
  return <EmbedClient cityId={cityId} routes={routes} />;
}
