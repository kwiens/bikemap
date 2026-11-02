import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitConditionReport } from '@/payload/conditions/submit';
import { POST } from './route';

vi.mock('@/payload/conditions/submit', () => ({
  submitConditionReport: vi.fn(),
}));
vi.mock('@/payload/read/conditions', () => ({ getConditionSummary: vi.fn() }));

const JSON_HEADERS = { 'content-type': 'application/json' };
const URL_BEND = 'https://ridebend.org/api/map/conditions?city=bend';
const REPORT = JSON.stringify({
  condition: 'dry',
  observedAt: new Date().toISOString(),
  slug: 'phils',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(submitConditionReport).mockResolvedValue({
    ok: true,
    report: {},
  } as Awaited<ReturnType<typeof submitConditionReport>>);
});

describe('POST conditions validation', () => {
  it.each([null, [], 12, 'text'])(
    'rejects non-object JSON %j without writing',
    async (body) => {
      const response = await POST(
        new Request(
          'https://bikechatt.com/api/map/conditions?city=chattanooga',
          {
            body: JSON.stringify(body),
            headers: JSON_HEADERS,
            method: 'POST',
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
        body: '{}',
        headers: JSON_HEADERS,
        method: 'POST',
      }),
    );
    expect(response.status).toBe(400);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });

  it('answers a honeypot without writing', async () => {
    const response = await POST(
      new Request('https://bikechatt.com/api/map/conditions?city=bend', {
        body: JSON.stringify({ website: 'spam' }),
        headers: JSON_HEADERS,
        method: 'POST',
      }),
    );
    expect(response.status).toBe(200);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });
});

describe('POST conditions cross-site protection', () => {
  it('rejects a simple text/plain POST, which skips the CORS preflight', async () => {
    const response = await POST(
      new Request(URL_BEND, {
        body: REPORT,
        headers: { 'content-type': 'text/plain' },
        method: 'POST',
      }),
    );
    expect(response.status).toBe(415);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { origin: 'https://evil.example' },
    { origin: 'null' },
  ])('rejects a request from another site (%j)', async (headers) => {
    const response = await POST(
      new Request(URL_BEND, {
        body: REPORT,
        headers: { ...JSON_HEADERS, ...headers },
        method: 'POST',
      }),
    );
    expect(response.status).toBe(403);
    expect(submitConditionReport).not.toHaveBeenCalled();
  });

  it('files a same-origin report', async () => {
    const response = await POST(
      new Request(URL_BEND, {
        body: REPORT,
        headers: {
          ...JSON_HEADERS,
          host: 'ridebend.org',
          origin: 'https://ridebend.org',
          'sec-fetch-site': 'same-origin',
        },
        method: 'POST',
      }),
    );
    expect(response.status).toBe(200);
    expect(submitConditionReport).toHaveBeenCalledOnce();
  });
});
