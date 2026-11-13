import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { getCityLogo } from '@/payload/read/theme';
import { renderSiteIcon, SITE_ICON_SIZES } from './site-icon';

vi.mock('server-only', () => ({}));
vi.mock('@/payload/read/theme', () => ({ getCityLogo: vi.fn() }));

vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_QAStore_test');

const logo =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path fill="red" d="M0 0h200v100H0z"/></svg>';

function setBendLogo(filename: string, prefix?: string, objectKey?: string) {
  vi.mocked(getCityLogo).mockResolvedValue({
    filename,
    prefix,
    _objectKey: objectKey,
  });
}

function embeddedArtwork(svg: string): string {
  const data = svg.match(/href="data:image\/svg\+xml;base64,([^"]+)"/);
  expect(data).not.toBeNull();
  return Buffer.from(data![1], 'base64').toString();
}

it.each(SITE_ICON_SIZES)(
  'preserves the vector in a %i-pixel SVG viewport',
  async (size) => {
    setBendLogo('bend.svg');
    vi.mocked(fetch).mockResolvedValue(new Response(logo));
    const response = await renderSiteIcon('bend', size);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'sandbox',
    );
    const svg = await response.text();
    expect(svg).toContain(
      `width="${size}" height="${size}" viewBox="0 0 100 100"`,
    );
    expect(embeddedArtwork(svg)).toBe(logo);
  },
);

it('fits maskable artwork inside the safe circle', async () => {
  setBendLogo('bend.svg');
  vi.mocked(fetch).mockResolvedValue(new Response(logo));
  const svg = await (await renderSiteIcon('bend', 512, true)).text();
  expect(svg).toContain('<image x="22" y="22" width="56" height="56"');
  expect(Math.hypot(28, 28)).toBeLessThan(40);
});

it('uses different default vectors for the two cities', async () => {
  vi.mocked(getCityLogo).mockResolvedValue(undefined);
  const [bend, chatt] = await Promise.all([
    renderSiteIcon('bend', 192),
    renderSiteIcon('chattanooga', 192),
  ]);
  expect(embeddedArtwork(await bend.text())).not.toEqual(
    embeddedArtwork(await chatt.text()),
  );
  expect(bend.headers.get('Cache-Control')).toBe('no-store');
});

it('falls back without caching invalid uploads', async () => {
  setBendLogo('invalid.svg');
  vi.mocked(fetch).mockResolvedValue(new Response('Not SVG'));
  const response = await renderSiteIcon('bend', 32);
  expect(embeddedArtwork(await response.text())).toContain('<svg');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('loads uploaded vectors from Blob for same-origin Payload URLs', async () => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_QAStore_test');
  vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', undefined);
  try {
    setBendLogo('bend logo.svg', 'city logos/qa', 'storage-key');
    vi.mocked(fetch).mockResolvedValue(new Response(logo));
    const response = await renderSiteIcon('bend', 180);
    expect(fetch).toHaveBeenCalledWith(
      'https://qastore.public.blob.vercel-storage.com/city%20logos/qa/storage-key/bend%20logo.svg',
      { signal: expect.any(AbortSignal), redirect: 'error' },
    );
    expect(response.headers.get('Cache-Control')).toContain('max-age=3600');
    expect(embeddedArtwork(await response.text())).toBe(logo);
  } finally {
    vi.unstubAllEnvs();
  }
});

it('loads local Payload uploads from disk', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'city-icon-test-'));
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
  try {
    await mkdir(path.join(directory, 'public/media'), { recursive: true });
    await writeFile(path.join(directory, 'public/media/local.svg'), logo);
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    setBendLogo('local.svg');
    const response = await renderSiteIcon('bend', 180);
    expect(embeddedArtwork(await response.text())).toBe(logo);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
