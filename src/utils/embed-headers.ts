// Framing policy for the app.
//
// `/embed` is the only route third-party sites may frame; everything else —
// including `/embed/demo`, which is an ordinary page — is locked to 'self' so
// the app cannot be used for clickjacking.

/**
 * CSP host-source grammar, deliberately stricter than a URL parse.
 *
 * `;` is the CSP directive separator and survives `new URL(...).origin`
 * intact (`https://evil.com;script-src` round-trips unchanged), so validating
 * by parsing would let a stray separator in the env var inject a second
 * directive. Only scheme + host (optionally a `*.` wildcard label) + port.
 */
const ORIGIN_PATTERN =
  /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

/**
 * Builds the `frame-ancestors` directive from `EMBED_ALLOWED_ORIGINS`.
 *
 * Accepts a space-separated origin list. Entries that are not valid CSP host
 * sources are dropped; if the value is non-empty but yields no valid origin,
 * falls back to `'self'` (fail closed) rather than emitting a broken header.
 *
 * An unset/empty value returns `frame-ancestors *`: embedding is open until an
 * operator opts into an allowlist, which matches the app's behaviour before
 * this header existed. Set the var to lock a deployment down.
 *
 * @param allowedOrigins - Space-separated origins, `*`, or undefined
 * @returns Full directive string (e.g. "frame-ancestors 'self' https://example.com")
 */
export function buildFrameAncestors(
  allowedOrigins: string | undefined,
): string {
  const trimmed = allowedOrigins?.trim();

  if (!trimmed || trimmed === '*') {
    return 'frame-ancestors *';
  }

  const origins = new Set(
    trimmed
      .split(/\s+/)
      .map((origin) => origin.trim())
      .filter((origin) => ORIGIN_PATTERN.test(origin)),
  );

  if (origins.size === 0) {
    // Every entry was malformed — deny rather than ship an open policy.
    return "frame-ancestors 'self'";
  }

  return `frame-ancestors 'self' ${[...origins].join(' ')}`;
}

interface Header {
  key: string;
  value: string;
}

interface HeaderConfig {
  source: string;
  headers: Header[];
}

/**
 * Next.js `headers()` config for framing policy. Emits two mutually exclusive
 * rules — Next appends the headers of *every* matching rule, and browsers
 * intersect multiple CSPs, so an overlap would silently apply the stricter
 * policy and break embedding.
 *
 * - `/embed` — framed by the allowlist (or anyone, when unset).
 * - everything else — `frame-ancestors 'self'`. The negative lookahead is
 *   anchored with `$` so it excludes exactly `/embed`: `/embed/demo` and a
 *   future `/embedded-guide` both keep the protection.
 *
 * The lookahead also has to allow for a trailing slash. Next compiles `/embed`
 * with an optional trailing `/`, so without the `/?` here `/embed/` matched
 * BOTH rules — and since browsers intersect multiple CSP headers, the strict
 * one won and a partner using `src=".../embed/?route=..."` got a blank frame.
 *
 * @param allowedOrigins - Space-separated origins from `EMBED_ALLOWED_ORIGINS`
 */
export function embedHeaders(
  allowedOrigins: string | undefined,
): HeaderConfig[] {
  const embedDirective = buildFrameAncestors(allowedOrigins);

  return [
    {
      source: '/embed',
      headers: [{ key: 'Content-Security-Policy', value: embedDirective }],
    },
    {
      source: '/((?!embed(?:/)?$).*)',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      ],
    },
  ];
}
