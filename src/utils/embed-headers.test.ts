import { describe, it, expect } from 'vitest';
import { buildFrameAncestors, embedHeaders } from './embed-headers';

describe('buildFrameAncestors', () => {
  it('opens framing when the var is unset, empty, or whitespace', () => {
    expect(buildFrameAncestors(undefined)).toBe('frame-ancestors *');
    expect(buildFrameAncestors('')).toBe('frame-ancestors *');
    expect(buildFrameAncestors('   ')).toBe('frame-ancestors *');
  });

  it('opens framing on an explicit *', () => {
    expect(buildFrameAncestors('*')).toBe('frame-ancestors *');
  });

  it('allowlists a single origin alongside self', () => {
    expect(buildFrameAncestors('https://partner.example.com')).toBe(
      "frame-ancestors 'self' https://partner.example.com",
    );
  });

  it('allowlists several origins, trimming and collapsing whitespace', () => {
    expect(
      buildFrameAncestors('  https://a.example   https://b.example  '),
    ).toBe("frame-ancestors 'self' https://a.example https://b.example");
  });

  it('deduplicates repeated origins', () => {
    expect(
      buildFrameAncestors('https://partner.example https://partner.example'),
    ).toBe("frame-ancestors 'self' https://partner.example");
  });

  it('accepts http, ports, and wildcard subdomains', () => {
    expect(buildFrameAncestors('http://localhost:3000')).toBe(
      "frame-ancestors 'self' http://localhost:3000",
    );
    expect(buildFrameAncestors('https://*.example.com')).toBe(
      "frame-ancestors 'self' https://*.example.com",
    );
  });

  it('drops entries that are not http(s)', () => {
    expect(
      buildFrameAncestors('https://valid.example ftp://invalid.example'),
    ).toBe("frame-ancestors 'self' https://valid.example");
  });

  // The important one: ';' separates CSP directives, and it survives a
  // `new URL(...).origin` round-trip intact — so a stray separator in the env
  // var must be rejected outright rather than spliced into the header.
  it('rejects entries that would inject a second CSP directive', () => {
    // The whole value is suspect, so it fails closed rather than salvaging
    // the part before the separator.
    expect(
      buildFrameAncestors("https://partner.example;script-src 'none'"),
    ).toBe("frame-ancestors 'self'");

    expect(buildFrameAncestors('https://evil.example;script-src')).toBe(
      "frame-ancestors 'self'",
    );
    // A valid origin alongside a malformed one still survives.
    expect(
      buildFrameAncestors('https://ok.example https://evil.example;script-src'),
    ).toBe("frame-ancestors 'self' https://ok.example");
    expect(buildFrameAncestors('https://a.example,https://b.example')).toBe(
      "frame-ancestors 'self'",
    );
    expect(buildFrameAncestors("https://a.example'")).toBe(
      "frame-ancestors 'self'",
    );
  });

  it('rejects credentials, paths, and bare schemes', () => {
    expect(buildFrameAncestors('https://user:pw@p.example')).toBe(
      "frame-ancestors 'self'",
    );
    expect(buildFrameAncestors('https://p.example/path')).toBe(
      "frame-ancestors 'self'",
    );
    expect(buildFrameAncestors('https://')).toBe("frame-ancestors 'self'");
  });

  it('fails closed when every entry is invalid', () => {
    expect(buildFrameAncestors('nonsense not-an-origin')).toBe(
      "frame-ancestors 'self'",
    );
  });
});

describe('embedHeaders', () => {
  it('emits two mutually exclusive rules', () => {
    const headers = embedHeaders(undefined);
    expect(headers.map((h) => h.source)).toEqual([
      '/embed',
      '/((?!embed(?:/)?$).*)',
    ]);
    for (const rule of headers) {
      expect(rule.headers).toHaveLength(1);
      expect(rule.headers[0].key).toBe('Content-Security-Policy');
    }
  });

  it('applies the allowlist to /embed and self to everything else', () => {
    const headers = embedHeaders('https://a.example https://b.example');

    expect(headers[0].source).toBe('/embed');
    expect(headers[0].headers[0].value).toBe(
      "frame-ancestors 'self' https://a.example https://b.example",
    );

    // The catch-all must never inherit the permissive directive.
    expect(headers[1].headers[0].value).toBe("frame-ancestors 'self'");
  });

  it('leaves the rest of the site locked down when embedding is open', () => {
    const headers = embedHeaders(undefined);
    expect(headers[0].headers[0].value).toBe('frame-ancestors *');
    expect(headers[1].headers[0].value).toBe("frame-ancestors 'self'");
  });
});

// These patterns are the actual security control, so assert on the compiled
// behaviour rather than the source strings. A prefix-anchored lookahead
// (`/((?!embed).*)`) silently leaves /embedded-help with no CSP at all.
describe('header source patterns (compiled with Next path matching)', () => {
  const toRegExp = (source: string): RegExp => {
    // Mirrors how Next compiles a headers() `source` into a matcher.
    const {
      pathToRegexp,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('next/dist/compiled/path-to-regexp');
    return pathToRegexp(source);
  };

  const [embedRule, catchAllRule] = embedHeaders(undefined);

  it('matches the embed route exactly', () => {
    const re = toRegExp(embedRule.source);
    expect(re.test('/embed')).toBe(true);
    expect(re.test('/embed/demo')).toBe(false);
    expect(re.test('/about')).toBe(false);
  });

  it('covers every other path, including embed-prefixed ones', () => {
    const re = toRegExp(catchAllRule.source);
    expect(re.test('/')).toBe(true);
    expect(re.test('/about')).toBe(true);
    expect(re.test('/embed/demo')).toBe(true);
    expect(re.test('/embedded-help')).toBe(true);
    expect(re.test('/embeds')).toBe(true);
    // Only the embed route itself is excluded — it has its own rule.
    expect(re.test('/embed')).toBe(false);
  });

  it('never lets both rules match the same path', () => {
    const embedRe = toRegExp(embedRule.source);
    const catchAllRe = toRegExp(catchAllRule.source);
    for (const path of [
      '/',
      '/about',
      '/embed',
      // A trailing slash is a common hand-edit in a partner's snippet. Next
      // compiles `/embed` with an optional trailing slash, so this used to
      // match both rules and the browser intersected them down to 'self',
      // blanking the frame.
      '/embed/',
      '/embed/demo',
      '/embedded-help',
      '/embeds',
      '/export',
      '/sw.js',
    ]) {
      const matches = [embedRe.test(path), catchAllRe.test(path)].filter(
        Boolean,
      );
      expect(matches).toHaveLength(1);
    }
  });
});
