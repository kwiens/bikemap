import { afterEach, describe, expect, it, vi } from 'vitest';
import { Media } from './Media';

const prepareUpload = Media.hooks!.beforeOperation![0];

afterEach(() => vi.unstubAllEnvs());

describe('Media storage availability', () => {
  it.each(['create', 'update'] as const)(
    'rejects %s on Vercel when Blob credentials are missing',
    (operation) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
      expect(() => prepareUpload({ operation, req: {} } as never)).toThrow(
        'Logo storage is not configured.',
      );
    },
  );

  it('allows local uploads without Blob credentials', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(() =>
      prepareUpload({ operation: 'create', req: {} } as never),
    ).not.toThrow();
  });

  it('allows configured Vercel uploads', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-credential');
    expect(() =>
      prepareUpload({ operation: 'create', req: {} } as never),
    ).not.toThrow();
  });

  it('gives replacement uploads new URLs while preserving their file extension', async () => {
    vi.stubEnv('VERCEL', '');
    const req = { file: { name: 'city-logo.png' } };
    await prepareUpload({ operation: 'update', req } as never);
    const firstName = req.file.name;
    await prepareUpload({ operation: 'update', req } as never);
    expect(req.file.name).not.toBe(firstName);
    expect(req.file.name).toMatch(/\.png$/);
  });

  it('keeps reads available when Blob credentials are missing', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(() =>
      prepareUpload({ operation: 'read', req: {} } as never),
    ).not.toThrow();
  });
});
