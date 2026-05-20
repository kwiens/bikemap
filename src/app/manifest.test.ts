import { describe, it, expect } from 'vitest';
import manifest from './manifest';
import { siteConfig } from '@/config/site.config';

describe('manifest', () => {
  it('builds the PWA manifest from siteConfig', () => {
    const m = manifest();
    expect(m.name).toBe(siteConfig.name);
    expect(m.short_name).toBe(siteConfig.shortName);
    expect(m.description).toBe(siteConfig.description);
    expect(m.theme_color).toBe(siteConfig.themeColor);
    expect(m.background_color).toBe(siteConfig.backgroundColor);
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('ships any + maskable icons', () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(icons.every((i) => i.src.startsWith('/icon-'))).toBe(true);
  });
});
