import type { NextConfig } from 'next';
import { embedHeaders } from './src/utils/embed-headers';

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return embedHeaders(process.env.EMBED_ALLOWED_ORIGINS);
  },
};

export default nextConfig;
