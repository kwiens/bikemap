import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedPage from './page';

const { routes, trails } = vi.hoisted(() => ({
  routes: vi.fn(async () => ({
    geojson: { features: [{ id: 'heavy' }], type: 'FeatureCollection' },
    routes: [{ id: 'riverwalk' }],
    status: 'ok',
  })),
  trails: vi.fn(async () => ({ status: 'ok', trails: [{ id: 'pondo' }] })),
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
  it('passes the client only the list it publishes', async () => {
    const casual = await EmbedPage({ searchParams: Promise.resolve({}) });
    expect(casual.props).toEqual({
      content: { cityId: 'chattanooga', routes: [{ id: 'riverwalk' }] },
      mode: 'casual',
    });

    const mtb = await EmbedPage({
      searchParams: Promise.resolve({ mode: 'mtb' }),
    });
    expect(mtb.props).toEqual({
      content: { cityId: 'chattanooga', trails: [{ id: 'pondo' }] },
      mode: 'mtb',
    });
  });
  it.each(['mtb', ['mtb', 'casual']])(
    'loads only trails for mode %s',
    async (mode) => {
      await EmbedPage({ searchParams: Promise.resolve({ mode }) });
      expect(trails).toHaveBeenCalledOnce();
      expect(routes).not.toHaveBeenCalled();
    },
  );
});
