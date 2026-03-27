import { describe, it, expect, beforeEach } from 'vitest';
import { getRideStyle } from './WelcomeModal';

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

  it('returns casual when cookie is set to casual', () => {
    document.cookie = 'bikechatt-ride-style=casual; path=/';
    expect(getRideStyle()).toBe('casual');
  });

  it('returns mountain when cookie is set to mountain', () => {
    document.cookie = 'bikechatt-ride-style=mountain; path=/';
    expect(getRideStyle()).toBe('mountain');
  });

  it('reads correctly when other cookies are present', () => {
    document.cookie = 'other-cookie=value; path=/';
    document.cookie = 'bikechatt-ride-style=mountain; path=/';
    document.cookie = 'another=thing; path=/';
    expect(getRideStyle()).toBe('mountain');
  });
});
