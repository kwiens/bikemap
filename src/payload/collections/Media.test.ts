import { afterEach, describe, expect, it, vi } from 'vitest';
import { Media } from './Media';

const prepareUpload = Media.hooks!.beforeOperation![0];

afterEach(() => vi.unstubAllEnvs());

describe('Media storage availability', () => {
  it.each(['create', 'update'] as const)(
    'rejects %s on Vercel when Blob credentials are missing',
    async (operation) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
      await expect(
        prepareUpload({ operation, req: {} } as never),
      ).rejects.toThrow('Logo storage is not configured.');
    },
  );

  it('allows local uploads without Blob credentials', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    await expect(
      prepareUpload({ operation: 'create', req: {} } as never),
    ).resolves.toBeUndefined();
  });

  it('allows configured Vercel uploads', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-credential');
    await expect(
      prepareUpload({ operation: 'create', req: {} } as never),
    ).resolves.toBeUndefined();
  });

  it('gives replacement SVGs new URLs', async () => {
    vi.stubEnv('VERCEL', '');
    const req = {
      file: {
        name: 'city-logo.svg',
        mimetype: 'image/svg+xml',
        data: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
        ),
      },
    };
    await prepareUpload({ operation: 'update', req } as never);
    const firstName = req.file.name;
    await prepareUpload({ operation: 'update', req } as never);
    expect(req.file.name).not.toBe(firstName);
    expect(req.file.name).toMatch(/\.svg$/);
  });

  it('keeps reads available when Blob credentials are missing', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    await expect(
      prepareUpload({ operation: 'read', req: {} } as never),
    ).resolves.toBeUndefined();
  });
});
