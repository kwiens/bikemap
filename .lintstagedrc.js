module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix --no-warn-ignored --max-warnings 0',
    // --no-errors-on-unmatched: staged files Biome ignores (e.g. the
    // auto-generated next-env.d.ts) must not fail the commit.
    'biome lint --write --unsafe --no-errors-on-unmatched',
    'biome format --write --no-errors-on-unmatched',
  ],
  '*.{json,jsonc}': (filenames) => {
    // Filter out files in public directory
    const filtered = filenames.filter(
      (f) => !f.startsWith('public/') && !f.includes('/public/'),
    );
    return filtered.length > 0
      ? [`biome format --write ${filtered.join(' ')}`]
      : [];
  },
};
