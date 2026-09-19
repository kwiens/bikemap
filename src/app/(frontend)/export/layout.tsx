import type { ReactElement, ReactNode } from 'react';
import { resolveActiveCityId } from '@/config/map.config';
import { getCityRoutes } from '@/payload/read/routes';
import { getRequestHostname } from '@/utils/request-hostname';
import { ExportRoutesProvider } from './ExportRoutesContext';

export default async function ExportLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const cityId = resolveActiveCityId(await getRequestHostname());
  const { routes } = await getCityRoutes(cityId);
  return (
    <ExportRoutesProvider routes={routes}>{children}</ExportRoutesProvider>
  );
}
