import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedPage from './page';

const { routes, trails } = vi.hoisted(() => ({
  routes: vi.fn(async () => ({ routes: [] })),
  trails: vi.fn(async () => ({ trails: [] })),
}));
vi.mock('@/payload/read/routes', () => ({ getCityRoutes: routes }));
vi.mock('@/payload/read/trails', () => ({ getCityTrailSummaries: trails }));
vi.mock('@/utils/request-hostname', () => ({
  getRequestHostname: async () => 'bikechatt.com',
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
