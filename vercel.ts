import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // Production applies committed Payload migrations before new code goes live.
  // Previews skip schema changes unless explicitly configured with an isolated DB.
  buildCommand: 'pnpm run ci',
  framework: 'nextjs',
  // Keep application traffic beside the Vercel-managed Neon resource.
  regions: ['iad1'],
};
