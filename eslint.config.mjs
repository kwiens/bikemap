import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'dist/**',
    '.vercel/**',
    'public/**',
    'next-env.d.ts',
    // Payload generates these files. Linting them creates churn that cannot be
    // fixed at the source.
    'src/payload-types.ts',
    'src/migrations/**',
    'src/app/(payload)/admin/importMap.js',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  // eslint-plugin-react does not support ESLint 10. @eslint-react provides the
  // equivalent modern React and DOM correctness checks.
  eslintReact.configs['recommended-typescript'],
  nextPlugin.configs['core-web-vitals'],
  {
    plugins: { 'react-hooks': reactHooksPlugin },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,

      // React Compiler is not enabled, so manual memoization remains useful.
      'react-hooks/preserve-manual-memoization': 'off',
      // Existing map lifecycle code intentionally uses refs during render and
      // synchronizes state from effects. Refactor those separately.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',

      // eslint-plugin-react-hooks is the source of truth for hooks and React
      // Compiler rules; disable @eslint-react's overlapping implementations.
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/use-memo': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/naming-convention-ref-name': 'off',
      '@eslint-react/no-context-provider': 'off',
      '@eslint-react/no-use-context': 'off',

      'no-console': ['error', { allow: ['debug', 'warn', 'error'] }],
      'array-callback-return': 'error',
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['scripts/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
]);
