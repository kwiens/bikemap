import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
};

// withPayload wires up the admin bundle and keeps Payload's server-only
// dependencies (pg, drizzle) out of the browser build.
export default withPayload(nextConfig, { devBundleServerPackages: false });
