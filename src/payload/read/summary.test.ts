import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPayload } from 'payload';
import { getTrailSummary } from './summary';
import { summarizeTrails } from './summary-model';

vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));
vi.mock('payload', () => ({ getPayload: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('getTrailSummary', () => {
  it('counts recent condition reports within the requested city, including hidden reports', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://summary-test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'));
    const count = vi.fn().mockResolvedValue({ totalDocs: 0 });
    count.mockResolvedValueOnce({ totalDocs: 2 });
    count.mockResolvedValueOnce({ totalDocs: 3 });
    count.mockResolvedValueOnce({ totalDocs: 7 });
    vi.mocked(getPayload).mockResolvedValue({
      find: vi.fn().mockResolvedValue({ docs: [] }),
      count,
    } as unknown as Awaited<ReturnType<typeof getPayload>>);

    const summary = await getTrailSummary('bend');

    expect(count).toHaveBeenCalledWith({
      collection: 'trail-conditions',
      where: {
        and: [
          { 'trail.city': { equals: 'bend' } },
          { createdAt: { greater_than: '2026-09-12T12:00:00.000Z' } },
        ],
      },
    });
    expect(summary).toMatchObject({
      city: 'bend',
      missingGeometry: 2,
      missingProfile: 3,
      reportsThisWeek: 7,
      unavailable: false,
    });
  });

  it('leaves report counts unavailable when the database fails', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://summary-test');
    vi.mocked(getPayload).mockRejectedValue(new Error('Database unavailable'));

    await expect(getTrailSummary('chattanooga')).resolves.toMatchObject({
      city: 'chattanooga',
      reportsThisWeek: null,
      unavailable: true,
    });
  });
});

describe('summarizeTrails', () => {
  it('combines ordered metadata with the two issue counts', () => {
    const summary = summarizeTrails(
      'bend',
      [
        {
          _status: 'published',
          displayName: 'No line',
          id: 1,
          osmReport: { warnings: ['Missing way'] },
        },
        {
          _status: 'published',
          displayName: 'No chart',
          id: 2,
        },
        {
          _status: 'draft',
          displayName: 'Work in progress',
          id: 3,
        },
      ],
      { missingGeometry: 1, missingProfile: 1 },
      7,
    );

    expect(summary).toMatchObject({
      city: 'bend',
      drafts: 1,
      missingGeometry: 1,
      missingProfile: 1,
      published: 2,
      reportsThisWeek: 7,
      unavailable: false,
      withWarnings: 1,
    });
    expect(summary.recent.map(({ name }) => name)).toEqual([
      'No line',
      'No chart',
      'Work in progress',
    ]);
  });
});
