import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WelcomeModal, getRideStyle } from './WelcomeModal';
import { MAP_EVENTS } from '@/events';

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    document.cookie = `${name}=; max-age=0; path=/`;
  });
}

describe('getRideStyle', () => {
  beforeEach(clearCookies);

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

describe('WelcomeModal component', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCookies();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows modal on first visit (no localStorage key)', () => {
    render(<WelcomeModal />);
    expect(screen.getByText('Bike Chatt')).toBeInTheDocument();
    expect(screen.getByText('How do you want to ride?')).toBeInTheDocument();
  });

  it('hides modal on return visit (localStorage key exists)', () => {
    localStorage.setItem('bikechatt-welcome-dismissed', '1');
    const { container } = render(<WelcomeModal />);
    expect(container.innerHTML).toBe('');
  });

  it('choosing casual sets cookie and dispatches RIDE_STYLE_CHOSEN', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);

    render(<WelcomeModal />);
    fireEvent.click(screen.getByText('Casual'));

    expect(getRideStyle()).toBe('casual');
    expect(localStorage.getItem('bikechatt-welcome-dismissed')).toBe('1');
    expect(events).toHaveLength(1);
    expect(events[0].detail.style).toBe('casual');

    window.removeEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);
  });

  it('choosing mountain sets cookie and dispatches RIDE_STYLE_CHOSEN', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);

    render(<WelcomeModal />);
    fireEvent.click(screen.getByText('Mountain'));

    expect(getRideStyle()).toBe('mountain');
    expect(events).toHaveLength(1);
    expect(events[0].detail.style).toBe('mountain');

    window.removeEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);
  });

  it('modal exits after choosing (with animation delay)', () => {
    render(<WelcomeModal />);
    fireEvent.click(screen.getByText('Casual'));

    // Should still be visible during animation
    expect(screen.getByText('Bike Chatt')).toBeInTheDocument();

    // After 400ms animation
    act(() => vi.advanceTimersByTime(400));

    expect(screen.queryByText('Bike Chatt')).not.toBeInTheDocument();
  });
});
