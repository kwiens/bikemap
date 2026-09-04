import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';
import { embedHeaders } from './src/utils/embed-headers';

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return embedHeaders(process.env.EMBED_ALLOWED_ORIGINS);
  },
};

// withPayload wires up the admin bundle and keeps Payload's server-only
// dependencies (pg, drizzle) out of the browser build.
export default withPayload(nextConfig, { devBundleServerPackages: false });
