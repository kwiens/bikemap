import { describe, expect, it, vi } from 'vitest';
import { getFrontendTheme } from './theme';
import { getSiteIcons } from './site-icons';

vi.mock('server-only', () => ({}));
vi.mock('./theme', () => ({ getFrontendTheme: vi.fn() }));

describe('city icon metadata', () => {
  it('uses default SVG icons for an unset city', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: { chattanooga: { logoUrl: '/media/chatt.svg', logoAlt: null } },
      css: '',
    });
    const icons = (await getSiteIcons('bend')).manifestIcons ?? [];
    expect(icons).toHaveLength(3);
    expect(
      icons.every(
        ({ src, type }) =>
          src.startsWith('/api/site-icon?city=bend&') &&
          !src.includes('&v=') &&
          type === 'image/svg+xml',
      ),
    ).toBe(true);
  });

  it('uses distinct city, size, and maskable URLs across metadata and manifest', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: {
        chattanooga: { logoUrl: '/media/chatt.svg', logoAlt: null },
        bend: { logoUrl: '/media/bend.svg', logoAlt: null },
      },
      css: '',
    });
    const chatt = await getSiteIcons('chattanooga');
    const bend = await getSiteIcons('bend');
    for (const icon of bend.manifestIcons!) {
      const url = new URL(icon.src, 'https://ridebend.org');
      expect(url.searchParams.get('city')).toBe('bend');
      expect(url.searchParams.get('size')).toBe(icon.sizes?.split('x')[0]);
      expect(url.searchParams.has('maskable')).toBe(
        icon.purpose === 'maskable',
      );
    }
    expect(chatt.manifestIcons![0].src).not.toBe(bend.manifestIcons![0].src);
    expect(JSON.stringify(bend.icons)).toContain('size=32');
    expect(JSON.stringify(bend.icons)).toContain('size=180');
    expect(JSON.stringify(bend.icons)).toContain('image/svg+xml');
  });

  it('changes icon URLs after replacing the logo and restores defaults after removing it', async () => {
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: { bend: { logoUrl: '/media/first.svg', logoAlt: null } },
      css: '',
    });
    const first = await getSiteIcons('bend');
    vi.mocked(getFrontendTheme).mockResolvedValue({
      branding: { bend: { logoUrl: '/media/replacement.svg', logoAlt: null } },
      css: '',
    });
    expect((await getSiteIcons('bend')).manifestIcons![0].src).not.toBe(
      first.manifestIcons![0].src,
    );
    vi.mocked(getFrontendTheme).mockResolvedValue({ branding: {}, css: '' });
    expect((await getSiteIcons('bend')).manifestIcons![0].src).toBe(
      '/api/site-icon?city=bend&size=192',
    );
  });
});
