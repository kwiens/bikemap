import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { readLogoSvg } from './logo-svg';

function vector(artwork: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${artwork}</svg>`;
}

it('preserves existing vector artwork and accepts local paint references', async () => {
  const logo = await readFile('public/Bike-Chatt_Logo-primary-blue-green.svg');
  expect(readLogoSvg(logo)).toBe(logo.toString());
  const gradient = vector(
    '<defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><style>rect { fill: url(#paint); }</style><rect width="10" height="10"/>',
  );
  expect(readLogoSvg(Buffer.from(gradient))).toBe(gradient);
});

it.each([
  'PNG bytes',
  '<svg xmlns="http://www.w3.org/2000/svg"/>',
  '<?xml-stylesheet href="styles.css"?>' + vector('<path/>'),
  '<!DOCTYPE svg>' + vector('<path/>'),
  vector('<script/>'),
  vector('<foreignObject/>'),
  vector('<rect onload="ignored"/>'),
  vector('<image href="data:image/png;base64,AAAA"/>'),
  vector('<use href="other.svg#logo"/>'),
  vector('<rect fill="url(other.svg#logo)"/>'),
  vector('<style>@import "other.css";</style>'),
  vector('<style>rect { fill: url(https://example.com/image); }</style>'),
])('rejects non-vector or non-self-contained artwork %s', (source) => {
  expect(() => readLogoSvg(Buffer.from(source))).toThrow();
});
