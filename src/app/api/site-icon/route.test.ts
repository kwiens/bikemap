import { expect, it, vi } from 'vitest';
import { GET } from './route';
import { renderSiteIcon } from '@/utils/site-icon';

vi.mock('@/utils/site-icon', () => ({
  SITE_ICON_SIZES: [32, 180, 192, 512],
  renderSiteIcon: vi.fn(async () => new Response('png')),
}));

it.each([
  'city=invalid&size=32',
  'city=bend&size=10000',
  'city=bend',
  'size=32',
])('rejects unsupported city or size: %s', async (query) => {
  expect(
    (await GET(new Request(`https://ridebend.org/api/site-icon?${query}`)))
      .status,
  ).toBe(400);
});

it('renders the requested city and maskable size', async () => {
  await GET(
    new Request(
      'https://ridebend.org/api/site-icon?city=bend&size=512&maskable=1',
    ),
  );
  expect(renderSiteIcon).toHaveBeenCalledWith('bend', 512, true);
});
