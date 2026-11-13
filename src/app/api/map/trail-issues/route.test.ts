import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitTrailIssue } from '@/payload/issues/submit';
import { POST } from './route';

vi.mock('@/payload/issues/submit', () => ({ submitTrailIssue: vi.fn() }));

const URL = 'https://bikechatt.com/api/map/trail-issues?city=chattanooga';
const SUBMISSION_ID = 'd6488436-1144-4ca5-a1f7-200419d8ae24';

function report() {
  const form = new FormData();
  form.set('slug', 'stringers-ridge');
  form.set('category', 'broken-feature');
  form.set('submissionId', SUBMISSION_ID);
  return form;
}

beforeEach(() => {
  vi.mocked(submitTrailIssue).mockReset();
  vi.mocked(submitTrailIssue).mockResolvedValue({ ok: true });
});

describe('POST trail issues', () => {
  it('passes the optional comment and photo to the issue writer', async () => {
    const form = report();
    form.set('comment', '  The bridge has a broken plank.  ');
    form.set(
      'photo',
      new File(['image bytes'], 'bridge.jpg', { type: 'image/jpeg' }),
    );

    const result = await POST(new Request(URL, { method: 'POST', body: form }));
    expect(result.status).toBe(200);
    expect(submitTrailIssue).toHaveBeenCalledExactlyOnceWith({
      category: 'broken-feature',
      city: 'chattanooga',
      comment: 'The bridge has a broken plank.',
      photo: expect.any(File),
      reporterHash: expect.any(String),
      slug: 'stringers-ridge',
      submissionId: SUBMISSION_ID,
    });
  });

  it('accepts an issue without a comment or photo', async () => {
    const response = await POST(
      new Request(URL, { method: 'POST', body: report() }),
    );
    expect(response.status).toBe(200);
    expect(submitTrailIssue).toHaveBeenCalledWith(
      expect.objectContaining({ comment: '', photo: null }),
    );
  });

  it('rejects a category outside the issue vocabulary', async () => {
    const form = report();
    form.set('category', 'snow');
    const response = await POST(
      new Request(URL, { method: 'POST', body: form }),
    );
    expect(response.status).toBe(400);
    expect(submitTrailIssue).not.toHaveBeenCalled();
  });

  it('rejects a cross-site upload before passing it to the writer', async () => {
    const response = await POST(
      new Request(URL, {
        method: 'POST',
        body: report(),
        headers: { origin: 'https://other.example' },
      }),
    );
    expect(response.status).toBe(403);
    expect(submitTrailIssue).not.toHaveBeenCalled();
  });

  it('bounds uploads without relying on Content-Length', async () => {
    const form = report();
    form.set('photo', new File([new Uint8Array(3_032_001)], 'large.jpg'));
    const response = await POST(
      new Request(URL, { method: 'POST', body: form }),
    );
    expect(response.status).toBe(413);
    expect(submitTrailIssue).not.toHaveBeenCalled();
  });
});
