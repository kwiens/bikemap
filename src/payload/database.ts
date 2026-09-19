/**
 * Uses Neon's pooled connection for application traffic and its direct
 * connection for schema changes. Payload's CLI loads this same config for both,
 * so the migration script marks that one process with PAYLOAD_MIGRATING.
 *
 * Local Postgres has no separate pooler. Falling back to DATABASE_URL keeps the
 * existing Docker workflow working without inventing a second local endpoint.
 */
export function resolveDatabaseUrl(
  environment: DatabaseEnvironment = process.env,
): string {
  if (environment.PAYLOAD_MIGRATING === 'true') {
    return normalizeSslMode(
      environment.DATABASE_URL_UNPOOLED || environment.DATABASE_URL || '',
    );
  }

  return normalizeSslMode(environment.DATABASE_URL || '');
}

/**
 * pg currently treats these modes as verify-full but will adopt libpq's weaker
 * meanings in its next major release. Make the current secure behavior
 * explicit for provider URLs while leaving local URLs untouched.
 */
function normalizeSslMode(connectionString: string): string {
  if (!connectionString) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode && LEGACY_VERIFIED_SSL_MODES.has(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
      return url.toString();
    }
  } catch {
    // Let the database driver report a malformed connection string with its
    // normal error rather than replacing it with a URL parsing error here.
  }

  return connectionString;
}

const LEGACY_VERIFIED_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

interface DatabaseEnvironment {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  PAYLOAD_MIGRATING?: string;
}
