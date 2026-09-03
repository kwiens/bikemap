import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { EmbedSnippetBuilder } from './EmbedSnippetBuilder';

// Mock the geo data module with two routes, matching src/app/page.test.tsx's convention.
vi.mock('@/data/geo_data', () => ({
  bikeRoutes: [
    {
      id: 'route-1',
      name: 'Riverwalk Loop',
      color: '#2563EB',
      description: 'Route 1',
      defaultWidth: 8,
      opacity: 1,
    },
    {
      id: 'route-2',
      name: 'Zoo Loop',
      color: '#F97316',
      description: 'Route 2',
      defaultWidth: 8,
      opacity: 1,
    },
  ],
}));

const baseUrl = 'https://bikechatt.com';

function getSnippetText() {
  return screen.getByText(/<iframe/).closest('pre')?.textContent ?? '';
}

afterEach(() => {
  cleanup();
});

describe('EmbedSnippetBuilder', () => {
  it('defaults to a bare /embed snippet with no query string', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const snippet = getSnippetText();
    expect(snippet).toContain(`${baseUrl}/embed`);
    expect(snippet).not.toContain(`${baseUrl}/embed?`);
  });

  it('adds sidebar=open to the snippet when toggled open', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const sidebarSelect = screen.getByLabelText('Sidebar');
    fireEvent.change(sidebarSelect, { target: { value: 'open' } });

    expect(getSnippetText()).toContain('sidebar=open');
  });

  it('sets the initial preview iframe src on first render', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const iframe = screen.getByTitle('Bike map') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/embed');
  });

  it('selecting a marker layer emits layers=<that one>', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    fireEvent.click(screen.getByLabelText('Attractions'));

    expect(getSnippetText()).toContain('layers=attractions');
  });

  it('selecting a different marker layer replaces rather than appends', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    expect(getSnippetText()).toContain('layers=attractions');

    fireEvent.click(screen.getByLabelText('Bike rentals'));
    const snippet = getSnippetText();
    expect(snippet).toContain('layers=bikeRentals');
    expect(snippet).not.toContain('attractions');
  });

  it('the bike-network toggle combines with a marker selection', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    fireEvent.click(screen.getByLabelText('Bike network'));

    expect(getSnippetText()).toContain('layers=attractions%2CbikeNetwork');
  });

  it('selecting "None" clears the marker layer but keeps bike network', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    fireEvent.click(screen.getByLabelText('Bike network'));
    fireEvent.click(screen.getByLabelText('None'));

    expect(getSnippetText()).toContain('layers=bikeNetwork');
  });

  it('excludes an out-of-range zoom from the snippet and shows a validation message', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '40' } });

    expect(getSnippetText()).not.toContain('zoom=');
    expect(
      screen.getByText('Zoom must be between 0 and 24'),
    ).toBeInTheDocument();
  });

  it('includes an in-range zoom in the snippet with no validation message', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '13' } });

    expect(getSnippetText()).toContain('zoom=13');
    expect(
      screen.queryByText('Zoom must be between 0 and 24'),
    ).not.toBeInTheDocument();
  });

  it('does not show a validation message for transient mid-edit values', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '-' } });

    expect(
      screen.queryByText('Zoom must be between 0 and 24'),
    ).not.toBeInTheDocument();
    expect(getSnippetText()).not.toContain('zoom=');
  });

  it('debounces the preview iframe navigation instead of remounting on every change', () => {
    vi.useFakeTimers();
    try {
      render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

      const iframe = screen.getByTitle('Bike map') as HTMLIFrameElement;
      const initialElement = iframe;

      fireEvent.click(screen.getByLabelText('Attractions'));
      // Snippet text updates immediately, unaffected by the debounce.
      expect(getSnippetText()).toContain('layers=attractions');

      // The iframe element itself is never recreated (no `key` remount).
      expect(screen.getByTitle('Bike map')).toBe(initialElement);

      // Advancing past the debounce window should not throw even though
      // jsdom's contentWindow.location.replace is a no-op/unimplemented —
      // the effect must fall back gracefully.
      expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
