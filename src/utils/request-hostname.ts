import { headers } from 'next/headers';

// Server-only: resolve the hostname of the current request so per-city content
// (layout metadata, manifest, about page) matches the host being served.
export async function getRequestHostname(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    return (
      requestHeaders.get('x-forwarded-host') ??
      requestHeaders.get('host') ??
      undefined
    );
  } catch {
    return undefined;
  }
}
