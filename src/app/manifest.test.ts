import { describe, it, expect, vi } from 'vitest';
import manifest from './manifest';
import { siteConfig } from '@/config/site.config';

vi.mock('server-only', () => ({}));
vi.mock('@/payload/read/theme', () => ({
  getCityLogo: vi.fn(async () => undefined),
}));

describe('manifest', () => {
  it('builds the PWA manifest from siteConfig', async () => {
    const m = await manifest();
    expect(m.name).toBe(siteConfig.name);
    expect(m.short_name).toBe(siteConfig.shortName);
    expect(m.description).toBe(siteConfig.description);
    expect(m.theme_color).toBe(siteConfig.themeColor);
    expect(m.background_color).toBe(siteConfig.backgroundColor);
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('ships any + maskable icons', async () => {
    const icons = (await manifest()).icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(icons.every((icon) => icon.type === 'image/svg+xml')).toBe(true);
  });
});
