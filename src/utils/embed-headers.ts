/**
 * Builds Content-Security-Policy frame-ancestors directive for embed mode.
 *
 * Parses space-separated origins, trims whitespace, drops empties and invalid entries,
 * deduplicates. Only accepts origins starting with http:// or https://.
 * Falls back to 'self' if the input is non-empty but produces no valid origins.
 *
 * @param allowedOrigins - Space-separated origins or undefined
 * @returns Full directive string (e.g., "frame-ancestors 'self' https://example.com")
 */
export function buildFrameAncestors(
  allowedOrigins: string | undefined,
): string {
  if (!allowedOrigins || allowedOrigins.trim() === '') {
    return 'frame-ancestors *';
  }

  const trimmed = allowedOrigins.trim();

  // Handle explicit '*'
  if (trimmed === '*') {
    return 'frame-ancestors *';
  }

  // Split on whitespace, filter for valid http(s) origins, deduplicate
  const origins = new Set(
    trimmed
      .split(/\s+/)
      .map((o) => o.trim())
      .filter(
        (o) =>
          o.length > 0 && (o.startsWith('http://') || o.startsWith('https://')),
      ),
  );

  // If we have valid origins, use 'self' + all of them
  if (origins.size > 0) {
    return `frame-ancestors 'self' ${Array.from(origins).join(' ')}`;
  }

  // All entries were invalid or empty — fail closed
  return "frame-ancestors 'self'";
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
 * Returns Next.js headers config for embed mode.
 *
 * Emits three rules:
 * - '/embed' and '/embed/:path*': framed only by allowed origins
 * - All other paths: framed only by 'self' (clickjacking protection)
 *
 * @param allowedOrigins - Space-separated origins from env var
 * @returns Array of header configs for Next.js
 */
export function embedHeaders(
  allowedOrigins: string | undefined,
): HeaderConfig[] {
  const embedDirective = buildFrameAncestors(allowedOrigins);
  const selfDirective = "frame-ancestors 'self'";

  return [
    {
      source: '/embed/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: embedDirective,
        },
      ],
    },
    {
      source: '/embed',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: embedDirective,
        },
      ],
    },
    {
      source: '/((?!embed).*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: selfDirective,
        },
      ],
    },
  ];
}
