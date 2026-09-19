import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    watch: false,
    setupFiles: ['./tests/vitest-setup.ts'],
    alias: {
      '@': resolve(__dirname, './src'),
      // Mirrors the tsconfig path. Modules under src/payload import the Payload
      // config through this specifier; without the alias Vite fails to resolve
      // it at transform time, before `vi.mock` ever gets a chance to intercept.
      '@payload-config': resolve(__dirname, './src/payload.config.ts'),
    },
  },
});
