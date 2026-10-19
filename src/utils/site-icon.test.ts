import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { getFrontendTheme } from '@/payload/read/theme';
import { renderSiteIcon, SITE_ICON_SIZES } from './site-icon';

vi.mock('server-only', () => ({}));
vi.mock('@/payload/read/theme', () => ({ getFrontendTheme: vi.fn() }));

describe('city icon rendering', () => {
  it.each(SITE_ICON_SIZES)(
    'renders an uploaded rectangular logo as a %i-pixel PNG',
    async (size) => {
      vi.mocked(getFrontendTheme).mockResolvedValue({
        branding: {
          bend: { logoUrl: 'https://example.com/bend.webp', logoAlt: 'Bend' },
        },
        css: '',
      });
      const input = await sharp({
        create: { width: 200, height: 100, channels: 4, background: 'red' },
      })
        .webp()
        .toBuffer();
      vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(input)));
      const response = await renderSiteIcon('bend', size);
      const output = Buffer.from(await response.arrayBuffer());
      expect(await sharp(output).metadata()).toMatchObject({
        width: size,
        height: size,
        format: 'png',
      });
      expect(response.headers.get('Content-Type')).toBe('image/png');
      const { data, info } = await sharp(output)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const center =
        (Math.floor(size / 2) * info.width + Math.floor(size / 2)) *
        info.channels;
      expect(data[center]).toBeGreaterThan(240);
      expect(data[center + 1]).toBeLessThan(10);
      expect([...data.subarray(0, 3)]).toEqual([195, 244, 77]);
    },
  );

  it('keeps maskable artwork inside the safe circle', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: {
        bend: { logoUrl: 'https://example.com/bend.png', logoAlt: null },
      },
      css: '',
    });
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(input)));
    const response = await renderSiteIcon('bend', 512, true);
    const { data, info } = await sharp(
      Buffer.from(await response.arrayBuffer()),
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset + 1] < 10)
          expect(Math.hypot(x - 256, y - 256)).toBeLessThan(512 * 0.4);
      }
    }
  });

  it('uses the existing icon when a city has no upload, even if another does', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: {
        chattanooga: {
          logoUrl: 'https://example.com/chatt.png',
          logoAlt: null,
        },
      },
      css: '',
    });
    const response = await renderSiteIcon('bend', 192);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await readFile('public/icon-192.png'),
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falls back without caching an unavailable upload', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: {
        bend: { logoUrl: 'https://example.com/missing.png', logoAlt: null },
      },
      css: '',
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const response = await renderSiteIcon('bend', 32);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await readFile('public/favicon.png'),
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reads local Payload uploads without requiring an HTTP server', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'city-icon-test-'));
    try {
      await mkdir(path.join(directory, 'public/media'), { recursive: true });
      const input = await sharp({
        create: { width: 100, height: 200, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();
      await writeFile(path.join(directory, 'public/media/local.png'), input);
      vi.spyOn(process, 'cwd').mockReturnValue(directory);
      vi.mocked(getFrontendTheme).mockResolvedValue({
        branding: {
          bend: { logoUrl: '/api/media/file/local.png', logoAlt: null },
        },
        css: '',
      });
      const response = await renderSiteIcon('bend', 180);
      expect(
        await sharp(Buffer.from(await response.arrayBuffer())).metadata(),
      ).toMatchObject({ width: 180, height: 180, format: 'png' });
      expect(response.headers.get('Cache-Control')).toContain('max-age=3600');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
