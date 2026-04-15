const COOKIE_NAME = 'bikechatt-settings';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type RideStyle = 'casual' | 'mountain';

interface Settings {
  rideStyle?: RideStyle;
  sidebarOpen?: boolean;
  activeTab?: 'routes' | 'trails';
}

function readCookie(): Settings {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`),
  );
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

function writeCookie(settings: Settings) {
  const value = encodeURIComponent(JSON.stringify(settings));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}`;
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
