import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitConditionReport } from '@/payload/conditions/submit';
import { POST } from './route';

vi.mock('@/payload/conditions/submit', () => ({
  submitConditionReport: vi.fn(),
}));
vi.mock('@/payload/read/conditions', () => ({ getConditionSummary: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('POST conditions validation', () => {
  it.each([null, [], 12, 'text'])(
    'rejects non-object JSON %j without writing',
    async (body) => {
      const response = await POST(
        new Request(
          'https://bikechatt.com/api/map/conditions?city=chattanooga',
          {
            method: 'POST',
            body: JSON.stringify(body),
          },
        ),
      );
      expect(response.status).toBe(400);
      expect(submitConditionReport).not.toHaveBeenCalled();
    },
  );

  it('uses the shared city registry without normalizing an invalid city', async () => {
    const response = await POST(
      new Request('https://bikechatt.com/api/map/conditions?city=BEND', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(response.status).toBe(400);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });

  it('answers a honeypot without writing', async () => {
    const response = await POST(
      new Request('https://bikechatt.com/api/map/conditions?city=bend', {
        method: 'POST',
        body: JSON.stringify({ website: 'spam' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });
});
