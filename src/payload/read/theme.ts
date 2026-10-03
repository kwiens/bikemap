import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ThemeDoc {
  accentColor?: null | string;
  primaryColor?: null | string;
  sidebarColor?: null | string;
  surfaceColor?: null | string;
  textColor?: null | string;
}

const FRONTEND_VARIABLES: Array<[keyof ThemeDoc, string]> = [
  ['primaryColor', '--app-primary'],
  ['sidebarColor', '--app-secondary'],
  ['surfaceColor', '--app-surface'],
  ['textColor', '--app-ink'],
  ['accentColor', '--app-accent'],
];

/** Admin brand variables. Payload's structural styling stays in custom.css. */
export function buildThemeCss(theme: ThemeDoc): string {
  const declarations: string[] = [];

  if (isHex(theme.primaryColor)) {
    declarations.push(`--brand-accent:${theme.primaryColor}`);
    declarations.push(
      `--accessibility-outline:2px solid ${theme.primaryColor}`,
    );
  }
  if (isHex(theme.sidebarColor)) {
    declarations.push(`--brand-deep:${theme.sidebarColor}`);
  }

  return rootRule(declarations);
}

/** Validated public-site variables only; arbitrary CSS never reaches markup. */
export function buildFrontendThemeCss(theme: ThemeDoc): string {
  const declarations = FRONTEND_VARIABLES.flatMap(([field, variable]) => {
    const value = theme[field];
    return isHex(value) ? [`${variable}:${hexToRgbChannels(value)}`] : [];
  });

  return rootRule(declarations);
}

function isHex(value: null | string | undefined): value is string {
  return Boolean(value && HEX.test(value));
}

function hexToRgbChannels(hex: string): string {
  return [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
    .join(' ');
}

function rootRule(declarations: string[]): string {
  return declarations.length > 0 ? `:root{${declarations.join(';')}}` : '';
}

export async function getThemeCss(): Promise<string> {
  const theme = await readTheme();
  return theme ? buildThemeCss(theme) : '';
}

export async function getFrontendThemeCss(): Promise<string> {
  const theme = await readTheme();
  return theme ? buildFrontendThemeCss(theme) : '';
}

/** Database failures must never take either the map or admin login down. */
async function readTheme(): Promise<ThemeDoc | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const payload = await getPayload({ config });
    return (await payload.findGlobal({
      slug: 'theme',
      depth: 0,
    })) as ThemeDoc;
  } catch (error) {
    console.error('Could not read the site theme; using defaults.', error);
    return null;
  }
}
