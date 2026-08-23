import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    watch: false,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./tests/vitest-setup.ts'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
