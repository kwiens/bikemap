import nextConfig from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';

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
      'next-env.d.ts',
    ],
  },
  ...nextConfig,
  ...nextTypescript,
  {
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    rules: {
      // Disable new react-hooks v7 rules until pre-existing patterns are refactored
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
  prettierConfig,
];

export default eslintConfig;
