import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.next/**/*',
      'node_modules/**',
      'out/**',
      'build/**',
      'dist/**',
      '.vercel/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
      'eslint-rules/**',
      'next-env.d.ts', // Next.js generated file
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  ...compat.extends(
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ),
];

export default eslintConfig;
