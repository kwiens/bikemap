import { resolveActiveCityId } from '@/config/map.config';
import { getRequestHostname } from '@/utils/request-hostname';
import { renderSiteIcon } from '@/utils/site-icon';

// Also serve the city logo to clients that request /favicon.ico directly.
export async function GET(): Promise<Response> {
  const response = await renderSiteIcon(
    resolveActiveCityId(await getRequestHostname()),
    32,
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
