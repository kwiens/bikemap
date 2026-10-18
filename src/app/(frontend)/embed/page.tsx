import type { ReactElement } from 'react';
import React from 'react';
import { resolveActiveCityId } from '@/config/map.config';
import { getCityRoutes } from '@/payload/read/routes';
import { getCityTrailSummaries } from '@/payload/read/trails';
import { parseEmbedMode } from '@/utils/embed';
import { getRequestHostname } from '@/utils/request-hostname';
import EmbedClient from './EmbedClient';
import { notFound } from 'next/navigation';
import { getGeneralSettings } from '@/payload/read/general-settings';

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[]; mode?: string | string[] }>;
}): Promise<ReactElement> {
  const [hostname, query] = await Promise.all([
    getRequestHostname(),
    searchParams,
  ]);
  const cityId = resolveActiveCityId(hostname, query.city);
  const mode = parseEmbedMode(query.mode);
  const settings = await getGeneralSettings();
  if (!settings.embeds) notFound();
  if (mode === 'casual' && !settings.casualRoutes) notFound();
  const content =
    mode === 'mtb'
      ? { cityId, ...(await getCityTrailSummaries(cityId)) }
      : { cityId, ...(await getCityRoutes(cityId)) };
  return <EmbedClient content={content} settings={settings} />;
}
