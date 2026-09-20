import { faRoute } from '@fortawesome/free-solid-svg-icons';
import type { Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import type { BikeRoute } from '../../src/data/bike-routes';
import { upsertStudioRoute } from './routes';

const route: BikeRoute = {
  color: '#F97316',
  defaultBounds: [-85.31, 35.03, -85.28, 35.07],
  defaultWidth: 8,
  description: 'Visit the zoo.',
  distance: 5.4,
  icon: faRoute,
  id: 'zoo-loop-v2-full-public',
  kind: 'ride',
  name: 'Zoo Loop',
  opacity: 1,
};

describe('upsertStudioRoute', () => {
  it('creates a published database record without copying geometry', async () => {
    const create = vi.fn().mockResolvedValue({});
    const payload = {
      create,
      find: vi.fn().mockResolvedValue({ docs: [] }),
    } as unknown as Payload;

    await expect(
      upsertStudioRoute(payload, { city: 'chattanooga', route }),
    ).resolves.toBe('created');
    expect(create).toHaveBeenCalledWith({
      collection: 'routes',
      data: expect.objectContaining({
        _status: 'published',
        geom: null,
        geometrySource: 'studio',
        routeId: route.id,
      }),
    });
  });

  it('does not restore Studio after a curator migrates the route', async () => {
    const update = vi.fn();
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, geometrySource: 'trail' }],
      }),
      update,
    } as unknown as Payload;

    await expect(
      upsertStudioRoute(payload, { city: 'chattanooga', route }),
    ).resolves.toBe('preserved');
    expect(update).not.toHaveBeenCalled();
  });

  it('repairs an imported placeholder that has no geometry', async () => {
    const update = vi.fn().mockResolvedValue({});
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, geom: null, geometrySource: 'imported' }],
      }),
      update,
    } as unknown as Payload;

    await expect(
      upsertStudioRoute(payload, { city: 'chattanooga', route }),
    ).resolves.toBe('updated');
    expect(update).toHaveBeenCalledWith({
      collection: 'routes',
      id: 7,
      data: expect.objectContaining({ geometrySource: 'studio' }),
    });
  });
});
