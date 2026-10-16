import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));

const { buildFrontendThemeCss, buildThemeCss } = await import('./theme');

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
