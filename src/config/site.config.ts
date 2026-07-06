// Site identity / branding configuration.
// A fork rebrands by editing this file (plus map.config.ts and src/data/*).

import type { CityId } from '@/data/cities/types';
import { activeCityId, cityConfigs, resolveActiveCityId } from './map.config';

export interface SiteConfig {
  /** City this site identity belongs to. */
  cityId: CityId;
  /** Full app name — page title and welcome-modal heading. */
  name: string;
  /** Short name — PWA manifest short_name and iOS web-app title. */
  shortName: string;
  /** One-line description — meta description and PWA manifest. */
  description: string;
  /** Tagline shown under the name in the welcome modal. */
  tagline: string;
  /** Production URL, used for the canonical link. No trailing slash. */
  url: string;
  /** PWA theme color (hex). */
  themeColor: string;
  /** PWA splash background color (hex). */
  backgroundColor: string;
  /**
   * Prefix for cookie / localStorage keys. Keep this stable for an existing
   * deployment so returning users' settings survive; a fork picks its own.
   */
  storageKeyPrefix: string;
}

const DEFAULT_THEME_COLOR = '#c3f44d';

export const siteConfigs: Record<CityId, SiteConfig> = {
  chattanooga: {
    cityId: 'chattanooga',
    name: 'Bike Chatt',
    shortName: 'Bike Chatt',
    description: descriptionForCity('chattanooga'),
    tagline: taglineForCity('chattanooga'),
    url: 'https://bikechatt.com',
    themeColor: DEFAULT_THEME_COLOR,
    backgroundColor: DEFAULT_THEME_COLOR,
    storageKeyPrefix: 'bikechatt',
  },
  bend: {
    cityId: 'bend',
    name: 'Ride Bend',
    shortName: 'Ride Bend',
    description: descriptionForCity('bend'),
    tagline: taglineForCity('bend'),
    url: 'https://ridebend.org',
    themeColor: DEFAULT_THEME_COLOR,
    backgroundColor: DEFAULT_THEME_COLOR,
    storageKeyPrefix: 'ridebend',
  },
};

export const siteConfig = siteConfigs[activeCityId];

export function siteConfigForHostname(
  hostname: string | undefined,
): SiteConfig {
  return siteConfigs[resolveActiveCityId(hostname)];
}

function descriptionForCity(cityId: CityId): string {
  const region = cityConfigs[cityId].region.displayName;
  const state = cityConfigs[cityId].region.stateCode;
  return `Paths and routes for cyclists in ${region}, ${state}`;
}

function taglineForCity(cityId: CityId): string {
  return `Your guide to biking ${cityConfigs[cityId].region.displayName}`;
}
