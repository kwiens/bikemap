import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { resolveActiveCityId } from '@/config/map.config';
import { siteConfigForHostname } from '@/config/site.config';
import { getCityRoutes } from '@/payload/read/routes';
import { getRequestHostname } from '@/utils/request-hostname';
import { ExportClient } from './ExportClient';

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
    title: `Export Bike Routes — ${config.name}`,
  };
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[] }>;
}): Promise<ReactElement> {
  const [hostname, query] = await Promise.all([
    getRequestHostname(),
    searchParams,
  ]);
  const cityId = resolveActiveCityId(hostname, query.city);
  const { routes } = await getCityRoutes(cityId);

  return <ExportClient cityId={cityId} routes={routes} />;
}
