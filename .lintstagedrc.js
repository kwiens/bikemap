module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix --max-warnings 0',
    'biome lint --write --unsafe',
    'biome format --write',
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
