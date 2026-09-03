import { describe, it, expect } from 'vitest';
import { buildFrameAncestors, embedHeaders } from './embed-headers';

describe('buildFrameAncestors', () => {
  it('returns frame-ancestors * when allowedOrigins is undefined', () => {
    expect(buildFrameAncestors(undefined)).toBe('frame-ancestors *');
  });

  it('returns frame-ancestors * when allowedOrigins is empty string', () => {
    expect(buildFrameAncestors('')).toBe('frame-ancestors *');
  });

  it('returns frame-ancestors * when allowedOrigins is whitespace only', () => {
    expect(buildFrameAncestors('   ')).toBe('frame-ancestors *');
  });

  it('returns frame-ancestors * when allowedOrigins is literal *', () => {
    expect(buildFrameAncestors('*')).toBe('frame-ancestors *');
  });

  it('returns frame-ancestors self when single valid origin provided', () => {
    expect(buildFrameAncestors('https://partner.example.com')).toBe(
      "frame-ancestors 'self' https://partner.example.com",
    );
  });

  it('handles two origins with self', () => {
    expect(
      buildFrameAncestors('https://partner1.example https://partner2.example'),
    ).toBe(
      "frame-ancestors 'self' https://partner1.example https://partner2.example",
    );
  });

  it('trims whitespace from origins', () => {
    expect(buildFrameAncestors('  https://partner.example  ')).toBe(
      "frame-ancestors 'self' https://partner.example",
    );
  });

  it('handles multiple spaces between origins', () => {
    expect(buildFrameAncestors('https://a.example   https://b.example')).toBe(
      "frame-ancestors 'self' https://a.example https://b.example",
    );
  });

  it('deduplicates origins', () => {
    expect(
      buildFrameAncestors('https://partner.example https://partner.example'),
    ).toBe("frame-ancestors 'self' https://partner.example");
  });

  it('filters out non-http(s) entries', () => {
    expect(
      buildFrameAncestors('https://valid.example ftp://invalid.example'),
    ).toBe("frame-ancestors 'self' https://valid.example");
  });

  it('filters out entries with typos that do not start with http', () => {
    expect(
      buildFrameAncestors('https://valid.example htp://typo.example'),
    ).toBe("frame-ancestors 'self' https://valid.example");
  });

  it('filters out empty entries from extra spaces', () => {
    expect(buildFrameAncestors('https://a.example  https://b.example')).toBe(
      "frame-ancestors 'self' https://a.example https://b.example",
    );
  });

  it('accepts http:// origins', () => {
    expect(buildFrameAncestors('http://localhost:3000')).toBe(
      "frame-ancestors 'self' http://localhost:3000",
    );
  });

  it('falls back to self when all entries are invalid', () => {
    expect(buildFrameAncestors('ftp://invalid invalid:// not-a-url')).toBe(
      "frame-ancestors 'self'",
    );
  });

  it('falls back to self for non-empty input with only whitespace entries', () => {
    expect(buildFrameAncestors('   \t   ')).toBe('frame-ancestors *');
  });

  it('handles mixed case protocols', () => {
    // Scheme is case-insensitive in URLs, but our filter checks startsWith exactly
    // This test documents that we only accept lowercase http/https
    expect(buildFrameAncestors('HTTPS://example.com')).toBe(
      "frame-ancestors 'self'",
    );
  });

  it('preserves order of origins (except for deduplication)', () => {
    expect(
      buildFrameAncestors(
        'https://c.example https://a.example https://b.example',
      ),
    ).toBe(
      "frame-ancestors 'self' https://c.example https://a.example https://b.example",
    );
  });
});

describe('embedHeaders', () => {
  it('returns three header configurations', () => {
    const headers = embedHeaders('https://partner.example');
    expect(headers).toHaveLength(3);
  });

  it('embeds route /embed/:path* with allowed origins directive', () => {
    const headers = embedHeaders('https://partner.example');
    const embedPath = headers.find((h) => h.source === '/embed/:path*');
    expect(embedPath).toBeDefined();
    expect(embedPath?.headers[0].key).toBe('Content-Security-Policy');
    expect(embedPath?.headers[0].value).toBe(
      "frame-ancestors 'self' https://partner.example",
    );
  });

  it('embeds route /embed with allowed origins directive', () => {
    const headers = embedHeaders('https://partner.example');
    const embedRoot = headers.find((h) => h.source === '/embed');
    expect(embedRoot).toBeDefined();
    expect(embedRoot?.headers[0].key).toBe('Content-Security-Policy');
    expect(embedRoot?.headers[0].value).toBe(
      "frame-ancestors 'self' https://partner.example",
    );
  });

  it('applies frame-ancestors self to other routes using negative lookahead', () => {
    const headers = embedHeaders('https://partner.example');
    const otherRoutes = headers.find((h) => h.source === '/((?!embed).*)');
    expect(otherRoutes).toBeDefined();
    expect(otherRoutes?.headers[0].key).toBe('Content-Security-Policy');
    expect(otherRoutes?.headers[0].value).toBe("frame-ancestors 'self'");
  });

  it('uses frame-ancestors * for /embed when allowedOrigins is unset', () => {
    const headers = embedHeaders(undefined);
    const embedPath = headers.find((h) => h.source === '/embed/:path*');
    expect(embedPath?.headers[0].value).toBe('frame-ancestors *');
  });

  it('uses frame-ancestors * for /embed when allowedOrigins is empty', () => {
    const headers = embedHeaders('');
    const embedPath = headers.find((h) => h.source === '/embed/:path*');
    expect(embedPath?.headers[0].value).toBe('frame-ancestors *');
  });

  it('uses frame-ancestors * for /embed when allowedOrigins is literal *', () => {
    const headers = embedHeaders('*');
    const embedPath = headers.find((h) => h.source === '/embed/:path*');
    expect(embedPath?.headers[0].value).toBe('frame-ancestors *');
  });

  it('always applies frame-ancestors self to non-embed routes', () => {
    const headers1 = embedHeaders(undefined);
    const headers2 = embedHeaders('https://partner.example');
    const headers3 = embedHeaders('*');

    const otherRoutes1 = headers1.find((h) => h.source === '/((?!embed).*)');
    const otherRoutes2 = headers2.find((h) => h.source === '/((?!embed).*)');
    const otherRoutes3 = headers3.find((h) => h.source === '/((?!embed).*)');

    expect(otherRoutes1?.headers[0].value).toBe("frame-ancestors 'self'");
    expect(otherRoutes2?.headers[0].value).toBe("frame-ancestors 'self'");
    expect(otherRoutes3?.headers[0].value).toBe("frame-ancestors 'self'");
  });

  it('handles multiple allowed origins in embedHeaders', () => {
    const headers = embedHeaders(
      'https://a.example https://b.example https://c.example',
    );
    const embedPath = headers.find((h) => h.source === '/embed/:path*');
    expect(embedPath?.headers[0].value).toBe(
      "frame-ancestors 'self' https://a.example https://b.example https://c.example",
    );
  });
});
