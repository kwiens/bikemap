import { describe, it, expect, beforeEach } from 'vitest';
import { getRideStyle } from './WelcomeModal';
import { setSetting } from '@/utils/settings';

describe('getRideStyle', () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; max-age=0; path=/`;
    });
  });

  it('returns null when cookie is not set', () => {
    expect(getRideStyle()).toBeNull();
  });

  it('returns casual when setting is casual', () => {
    setSetting('rideStyle', 'casual');
    expect(getRideStyle()).toBe('casual');
  });

  it('returns mountain when setting is mountain', () => {
    setSetting('rideStyle', 'mountain');
    expect(getRideStyle()).toBe('mountain');
  });

  it('reads correctly when other cookies are present', () => {
    document.cookie = 'other-cookie=value; path=/';
    setSetting('rideStyle', 'mountain');
    document.cookie = 'another=thing; path=/';
    expect(getRideStyle()).toBe('mountain');
  });
});
