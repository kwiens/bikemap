import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));

vi.mock('payload', () => ({ getPayload: vi.fn() }));
const { getPayload } = await import('payload');

const { buildFrontendThemeCss, buildThemeCss, getFrontendTheme } = await import(
  './theme'
);

describe('buildThemeCss', () => {
  it('emits nothing when the theme is empty', () => {
    expect(buildThemeCss({})).toBe('');
  });

  it('maps the primary and sidebar colours to admin brand variables', () => {
    expect(
      buildThemeCss({
        primaryColor: '#c3f44d',
        sidebarColor: '#1a434e',
      }),
    ).toBe(
      ':root{--brand-accent:#c3f44d;--accessibility-outline:2px solid #c3f44d;--brand-deep:#1a434e}',
    );
  });

  it('ignores malformed colours', () => {
    expect(buildThemeCss({ primaryColor: 'red; }' })).toBe('');
    expect(buildThemeCss({ primaryColor: '#fff' })).toBe('');
  });
});

describe('buildFrontendThemeCss', () => {
  it('maps the palette to frontend variables', () => {
    expect(
      buildFrontendThemeCss({
        accentColor: '#a5d730',
        primaryColor: '#c3f44d',
        sidebarColor: '#1a434e',
        surfaceColor: '#ffffff',
        textColor: '#1a434e',
      }),
    ).toBe(
      ':root:root{--app-primary:195 244 77;--app-secondary:26 67 78;--app-surface:255 255 255;--app-ink:26 67 78;--app-accent:165 215 48}',
    );
  });

  it('emits valid fields while ignoring malformed ones', () => {
    expect(
      buildFrontendThemeCss({
        primaryColor: 'red',
        sidebarColor: '#1a434e',
      }),
    ).toBe(':root:root{--app-secondary:26 67 78}');
  });
});

describe('getFrontendTheme city logos', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns distinct city uploads from one Theme read', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const findGlobal = vi.fn().mockResolvedValue({
      logos: {
        chattanooga: { url: '/media/chatt.png', alt: 'Bike Chatt' },
        bend: { url: '/media/bend.png', alt: 'Ride Bend' },
      },
    });
    vi.mocked(getPayload).mockResolvedValue({
      findGlobal,
    } as unknown as Awaited<ReturnType<typeof getPayload>>);
    const { branding } = await getFrontendTheme();
    expect(branding).toEqual({
      chattanooga: { logoUrl: '/media/chatt.png', logoAlt: 'Bike Chatt' },
      bend: { logoUrl: '/media/bend.png', logoAlt: 'Ride Bend' },
    });
    expect(findGlobal).toHaveBeenCalledExactlyOnceWith({
      slug: 'theme',
      depth: 1,
    });
  });

  it('does not use another city or the legacy shared logo when a city has no populated upload', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const findGlobal = vi.fn().mockResolvedValue({
      logo: { url: '/media/legacy.png' },
      logos: { chattanooga: { url: '/media/chatt.png' }, bend: 42 },
    });
    vi.mocked(getPayload).mockResolvedValue({
      findGlobal,
    } as unknown as Awaited<ReturnType<typeof getPayload>>);
    expect((await getFrontendTheme()).branding).toEqual({
      chattanooga: { logoUrl: '/media/chatt.png', logoAlt: null },
    });
  });

  it('uses existing branding when the database is unavailable or unconfigured', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    vi.mocked(getPayload).mockRejectedValue(new Error('offline'));
    expect(await getFrontendTheme()).toEqual({ branding: {}, css: '' });
    vi.stubEnv('DATABASE_URL', '');
    expect(await getFrontendTheme()).toEqual({ branding: {}, css: '' });
  });
});
