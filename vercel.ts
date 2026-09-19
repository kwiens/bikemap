import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // Payload requires committed migrations before code using the new schema can
  // go live. Database-free forks still build the static fallback map.
  buildCommand: process.env.DATABASE_URL ? 'pnpm run ci' : 'pnpm run build',
  framework: 'nextjs',
  // Keep application traffic beside the Vercel-managed Neon resource.
  regions: ['iad1'],
};
