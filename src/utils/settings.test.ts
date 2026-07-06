import { describe, it, expect, beforeEach } from 'vitest';
import { getSetting, setSetting } from './settings';

describe('settings cookie', () => {
  beforeEach(() => {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; max-age=0; path=/`;
    });
  });

  it('returns undefined for unset key', () => {
    expect(getSetting('rideStyle')).toBeUndefined();
  });

  it('stores and retrieves rideStyle', () => {
    setSetting('rideStyle', 'mountain');
    expect(getSetting('rideStyle')).toBe('mountain');
  });

  it('stores and retrieves sidebarOpen', () => {
    setSetting('sidebarOpen', false);
    expect(getSetting('sidebarOpen')).toBe(false);
  });

  it('preserves other settings when updating one', () => {
    setSetting('rideStyle', 'casual');
    setSetting('sidebarOpen', false);
    expect(getSetting('rideStyle')).toBe('casual');
    expect(getSetting('sidebarOpen')).toBe(false);
  });

  it('overwrites a setting', () => {
    setSetting('rideStyle', 'casual');
    setSetting('rideStyle', 'mountain');
    expect(getSetting('rideStyle')).toBe('mountain');
  });

  it('handles malformed cookie gracefully', () => {
    document.cookie = 'bikechatt-settings=not-json; path=/';
    expect(getSetting('rideStyle')).toBeUndefined();
  });
});
