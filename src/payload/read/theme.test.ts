import { describe, it, expect, vi } from 'vitest';

// theme.ts is server-only and pulls in the Payload config; the pure CSS builder
// is what's worth testing, so the server guard and config are stubbed out.
vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));

const { buildThemeCss } = await import('./theme');

describe('buildThemeCss', () => {
  it('emits nothing when the theme is empty', () => {
    // An unset theme must fall through to the stylesheet defaults rather than
    // emitting an empty rule.
    expect(buildThemeCss({})).toBe('');
  });

  it('sets the accent colour and the focus ring together', () => {
    const css = buildThemeCss({ accentColor: '#c3f44d' });

    expect(css).toContain('--brand-accent:#c3f44d');
    // Payload drives every focus outline through this one variable, so the
    // accent is only actually visible if this moves with it.
    expect(css).toContain('--accessibility-outline:2px solid #c3f44d');
  });

  it('ignores a malformed colour rather than emitting broken CSS', () => {
    // The field validates, but a value could arrive from a direct API write.
    expect(buildThemeCss({ accentColor: 'red; }' })).toBe('');
    expect(buildThemeCss({ accentColor: '#fff' })).toBe('');
  });

  it('writes the full base ramp for a tint', () => {
    const css = buildThemeCss({ neutralTint: 'warm' });

    // Both ends of the scale must be present: dark mode is Payload inverting
    // this same ramp, so a partial one would theme only one mode.
    expect(css).toContain('--color-base-0:rgb(255,255,255)');
    expect(css).toContain('--color-base-1000:rgb(0,0,0)');
    expect(css).toContain('--color-base-500:');
  });

  it('maps corner styles to all three radii', () => {
    const css = buildThemeCss({ cornerStyle: 'round' });

    expect(css).toContain('--style-radius-s:10px');
    expect(css).toContain('--style-radius-m:16px');
    expect(css).toContain('--style-radius-l:24px');
  });

  it('keeps a system fallback behind the webfont', () => {
    // If Geist fails to load, the admin must not fall back to a serif default.
    expect(buildThemeCss({ fontFamily: 'geist' })).toContain(
      '--font-body:var(--font-geist-sans), -apple-system',
    );
  });

  it('strips angle brackets from custom CSS so it cannot close the style tag', () => {
    // This is the injection guard: the result is dropped into <style>, and a
    // stray </style> would turn styling into markup.
    const css = buildThemeCss({
      customCss: '</style><script>alert(1)</script>',
    });

    expect(css).not.toContain('<');
    expect(css).not.toContain('>');
    expect(css).toContain('scriptalert(1)/script');
  });

  it('passes ordinary custom CSS through', () => {
    expect(buildThemeCss({ customCss: '.nav { opacity: 0.9 }' })).toContain(
      '.nav { opacity: 0.9 }',
    );
  });

  it('combines variables and custom CSS, variables first', () => {
    const css = buildThemeCss({
      accentColor: '#123456',
      customCss: '.x{color:red}',
    });

    expect(css.indexOf(':root{')).toBeLessThan(css.indexOf('.x{'));
  });
});
