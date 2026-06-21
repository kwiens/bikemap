// Site identity / branding configuration.
// A fork rebrands by editing this file (plus map.config.ts and src/data/*).

import { mapConfig } from './map.config';

const region = mapConfig.region.displayName;
const state = mapConfig.region.stateCode;

export interface SiteConfig {
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

export const siteConfig: SiteConfig = {
  name: 'Bike Chatt',
  shortName: 'Bike Chatt',
  description: `Paths and routes for cyclists in ${region}, ${state}`,
  tagline: `Your guide to biking ${region}`,
  url: 'https://bikechatt.com',
  themeColor: '#c3f44d',
  backgroundColor: '#c3f44d',
  storageKeyPrefix: 'bikechatt',
};
