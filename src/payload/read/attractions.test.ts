import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPayload } from 'payload';
import { getCityAttractions } from './attractions';

vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));
vi.mock('payload', () => ({ getPayload: vi.fn() }));

const find = vi.fn();

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/database');
  vi.mocked(getPayload).mockResolvedValue({ find } as unknown as Awaited<
    ReturnType<typeof getPayload>
  >);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('returns only the requested city’s seed records when there is no database', async () => {
  vi.stubEnv('DATABASE_URL', undefined);

  const chattanooga = await getCityAttractions('chattanooga');
  const bend = await getCityAttractions('bend');

  expect(getPayload).not.toHaveBeenCalled();
  expect(chattanooga).toHaveLength(15);
  expect(chattanooga).toContainEqual(
    expect.objectContaining({
      name: 'Soddy Elementary School Traffic Garden (Planned)',
      address: '260 School St, Soddy-Daisy, TN 37379',
    }),
  );
  expect(bend).toHaveLength(12);
  expect(bend.every(({ id }) => id < 0)).toBe(true);
  expect(bend).not.toContainEqual(
    expect.objectContaining({
      name: expect.stringContaining('Traffic Garden'),
    }),
  );
});

it('uses the seed records when the database query fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  find.mockRejectedValue(Error('Database unavailable'));

  const attractions = await getCityAttractions('chattanooga');

  expect(attractions).toHaveLength(15);
  expect(attractions).toContainEqual(
    expect.objectContaining({
      name: 'Calvin Donaldson Elementary School Traffic Garden',
    }),
  );
});

it('uses the city-scoped public read and preserves an empty published list', async () => {
  find.mockResolvedValue({ docs: [] });

  await expect(getCityAttractions('bend')).resolves.toEqual([]);
  expect(find).toHaveBeenCalledWith(
    expect.objectContaining({
      collection: 'attractions',
      overrideAccess: false,
      where: { city: { equals: 'bend' } },
    }),
  );
});
