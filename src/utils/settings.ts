import { siteConfig } from '@/config/site.config';

const COOKIE_NAME = `${siteConfig.storageKeyPrefix}-settings`;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type RideStyle = 'casual' | 'mountain';

interface Settings {
  rideStyle?: RideStyle;
  sidebarOpen?: boolean;
  activeTab?: 'routes' | 'trails';
}

function readCookie(): Settings {
  if (typeof document === 'undefined') return {};
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`),
    );
    if (!match) return {};
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const { activeTab, rideStyle, sidebarOpen } = parsed as Record<
      string,
      unknown
    >;
    return {
      ...(activeTab === 'routes' || activeTab === 'trails'
        ? { activeTab }
        : {}),
      ...(rideStyle === 'casual' || rideStyle === 'mountain'
        ? { rideStyle }
        : {}),
      ...(typeof sidebarOpen === 'boolean' ? { sidebarOpen } : {}),
    };
  } catch {
    return {};
  }
}

function writeCookie(settings: Settings) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(settings));
  try {
    document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}`;
  } catch {
    // The UI can still apply the preference when cookies are unavailable.
  }
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return readCookie()[key];
}

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
) {
  const settings = readCookie();
  settings[key] = value;
  writeCookie(settings);
}
