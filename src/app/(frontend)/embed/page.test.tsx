import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedPage, { generateMetadata } from './page';
import { getSiteIcons } from '@/payload/read/site-icons';

const { routes, settings, trails } = vi.hoisted(() => ({
  routes: vi.fn(async () => ({ routes: [] })),
  settings: vi.fn(async () => ({ casualRoutes: true, embeds: true })),
  trails: vi.fn(async () => ({ trails: [] })),
}));
vi.mock('@/payload/read/general-settings', () => ({
  getGeneralSettings: settings,
}));
vi.mock('@/payload/read/routes', () => ({ getCityRoutes: routes }));
vi.mock('@/payload/read/trails', () => ({ getCityTrailSummaries: trails }));
vi.mock('@/utils/request-hostname', () => ({
  getRequestHostname: async () => 'bikechatt.com',
}));
vi.mock('@/payload/read/site-icons', () => ({
  getSiteIcons: vi.fn(async () => ({ icons: {}, manifestIcons: [] })),
}));
vi.mock('./EmbedClient', () => ({ default: () => null }));

beforeEach(() => vi.clearAllMocks());

describe('embed data loading', () => {
  it.each([undefined, 'casual', 'invalid'])(
    'loads only routes for mode %s',
    async (mode) => {
      await EmbedPage({ searchParams: Promise.resolve({ mode }) });
      expect(routes).toHaveBeenCalledOnce();
      expect(trails).not.toHaveBeenCalled();
    },
  );
  it.each(['mtb', ['mtb', 'casual']])(
    'loads only trails for mode %s',
    async (mode) => {
      await EmbedPage({ searchParams: Promise.resolve({ mode }) });
      expect(trails).toHaveBeenCalledOnce();
      expect(routes).not.toHaveBeenCalled();
    },
  );
});

it('uses the embedded city for favicon metadata', async () => {
  await generateMetadata({ searchParams: Promise.resolve({ city: 'bend' }) });
  expect(getSiteIcons).toHaveBeenCalledWith('bend');
});
