module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix --no-warn-ignored --max-warnings 0',
    'biome format --write --no-errors-on-unmatched',
  ],
  '*.{json,jsonc}': 'biome format --write --no-errors-on-unmatched',
};
