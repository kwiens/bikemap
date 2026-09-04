module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix --no-warn-ignored --max-warnings 0',
    // --no-errors-on-unmatched: staged files Biome ignores (e.g. the
    // auto-generated next-env.d.ts) must not fail the commit.
    'biome lint --write --unsafe --no-errors-on-unmatched',
    'biome format --write --no-errors-on-unmatched',
  ],
  '*.{json,jsonc}': (filenames) => {
    // Drop paths Biome is configured to ignore. Passing only ignored paths
    // makes Biome exit non-zero ("No files were processed"), which fails the
    // commit — and a commit touching just a generated migration does exactly
    // that. --no-errors-on-unmatched covers the rest.
    const filtered = filenames.filter(
      (f) =>
        !f.startsWith('public/') &&
        !f.includes('/public/') &&
        !f.includes('/src/migrations/'),
    );
    return filtered.length > 0
      ? [`biome format --write --no-errors-on-unmatched ${filtered.join(' ')}`]
      : [];
  },
};
