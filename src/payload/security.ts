import { siteConfigs } from '@/config/site.config';

const MIN_SECRET_LENGTH = 32;

/** Fail at startup instead of silently accepting an easy-to-guess signing key. */
export function requirePayloadSecret(
  secret = process.env.PAYLOAD_SECRET,
): string {
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_LENGTH) {
    throw new Error(
      `PAYLOAD_SECRET must be at least ${MIN_SECRET_LENGTH} bytes. Generate one with \`openssl rand -hex 32\`.`,
    );
  }

  return secret;
}

/**
 * Static analysis imports Payload config without loading Next's env files. A
 * deterministic fallback is acceptable only outside production/deployments;
 * those processes always require an operator-owned secret.
 */
export function payloadSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PAYLOAD_SECRET) {
    return requirePayloadSecret(env.PAYLOAD_SECRET);
  }

  if (env.NODE_ENV === 'production' || env.VERCEL_ENV) {
    return requirePayloadSecret(undefined);
  }

  return 'local-static-analysis-only-payload-secret';
}

/**
 * Origins allowed to authenticate with Payload's cookie.
 *
 * Production city domains come from the site registry, hostname aliases come
 * from the same env map used for multi-city routing, and Vercel contributes the
 * exact deployment/branch URLs for protected previews.
 */
export function payloadCsrfOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const origins = new Set<string>();

  for (const { url } of Object.values(siteConfigs)) {
    addOrigin(origins, url);

    const hostname = new URL(url).hostname;
    if (!hostname.startsWith('www.')) {
      addOrigin(origins, `https://www.${hostname}`);
    }
  }

  addHostnameMapOrigins(origins, env.NEXT_PUBLIC_CITY_HOST_MAP);
  for (const hostname of [
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    addOrigin(origins, hostname ? `https://${hostname}` : undefined);
  }

  if (env.NODE_ENV !== 'production') {
    addOrigin(origins, 'http://localhost:3000');
    addOrigin(origins, 'http://127.0.0.1:3000');
  }

  return [...origins];
}

function addHostnameMapOrigins(
  origins: Set<string>,
  rawHostMap: string | undefined,
): void {
  if (!rawHostMap) {
    return;
  }

  try {
    const hostMap = JSON.parse(rawHostMap) as Record<string, unknown>;
    for (const hostname of Object.keys(hostMap)) {
      addOrigin(origins, `https://${hostname}`);
    }
  } catch {
    // map.config.ts reports the malformed map; the CSRF list simply omits it.
  }
}

function addOrigin(origins: Set<string>, candidate: string | undefined): void {
  if (!candidate) {
    return;
  }

  try {
    const url = new URL(candidate);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === candidate &&
      /^[a-z0-9.-]+$/i.test(url.hostname) &&
      !url.username &&
      !url.password
    ) {
      origins.add(url.origin);
    }
  } catch {
    // Environment-derived values fail closed when they are not valid origins.
  }
}
