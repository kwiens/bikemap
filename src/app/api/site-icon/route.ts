import { cityIdForQuery } from '@/config/map.config';
import {
  renderSiteIcon,
  SITE_ICON_SIZES,
  type SiteIconSize,
} from '@/utils/site-icon';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const cityId = cityIdForQuery(params.get('city'));
  const size = Number(params.get('size'));
  if (!cityId || !SITE_ICON_SIZES.includes(size as SiteIconSize)) {
    return new Response('Unknown city or icon size', { status: 400 });
  }
  return renderSiteIcon(
    cityId,
    size as SiteIconSize,
    params.get('maskable') === '1',
  );
}
