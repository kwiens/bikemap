import 'server-only';

import { getPayload } from 'payload';
import { cache } from 'react';
import config from '@payload-config';
import type { CityBranding } from '@/components/SiteBrandingContext';

import { siteConfigs } from '@/config/site.config';
import type { CityId } from '@/data/cities/types';

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ThemeDoc {
  accentColor?: null | string;
  primaryColor?: null | string;
  sidebarColor?: null | string;
  surfaceColor?: null | string;
  textColor?: null | string;
  logos?: Partial<
    Record<
      CityId,
      | null
      | number
      | {
          alt?: null | string;
          url?: null | string;
        }
    >
  > | null;
}

type ThemeColorField = Exclude<keyof ThemeDoc, 'logos'>;

const FRONTEND_VARIABLES: Array<[ThemeColorField, string]> = [
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

  // Next may load the default stylesheet after this inline head style.
  // Extra specificity keeps saved values authoritative regardless of order.
  return rootRule(declarations, ':root:root');
}

function isHex(value: null | string | undefined): value is string {
  return Boolean(value && HEX.test(value));
}

function hexToRgbChannels(hex: string): string {
  return [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
    .join(' ');
}

function rootRule(declarations: string[], selector = ':root'): string {
  return declarations.length > 0
    ? `${selector}{${declarations.join(';')}}`
    : '';
}

export async function getThemeCss(): Promise<string> {
  const theme = await readTheme();
  return theme ? buildThemeCss(theme) : '';
}

export async function getFrontendTheme(): Promise<{
  branding: CityBranding;
  css: string;
}> {
  const theme = await readTheme(1);
  const branding: CityBranding = {};
  for (const { cityId } of Object.values(siteConfigs)) {
    const logo = theme?.logos?.[cityId];
    if (logo && typeof logo === 'object') {
      branding[cityId] = {
        logoAlt: logo.alt ?? null,
        logoUrl: logo.url ?? null,
      };
    }
  }

  return {
    branding,
    css: theme ? buildFrontendThemeCss(theme) : '',
  };
}

/** Database failures must never take either the map or admin login down. */
const readTheme = cache(async function readTheme(
  depth = 0,
): Promise<ThemeDoc | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const payload = await getPayload({ config });
    return (await payload.findGlobal({
      slug: 'theme',
      depth,
    })) as ThemeDoc;
  } catch (error) {
    console.error('Could not read the site theme; using defaults.', error);
    return null;
  }
});
