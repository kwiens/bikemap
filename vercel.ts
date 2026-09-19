import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // Production applies committed Payload migrations before new code goes live.
  // Preview builds share the global DB and deliberately skip schema changes.
  buildCommand: 'pnpm run ci',
  framework: 'nextjs',
  // Keep application traffic beside the Vercel-managed Neon resource.
  regions: ['iad1'],
};
