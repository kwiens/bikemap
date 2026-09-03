import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { EmbedSnippetBuilder } from './EmbedSnippetBuilder';
import type { EmbedBuilderConfig } from '@/utils/embed-options';

const CONFIG = {
  routes: [
    { id: 'route-1', name: 'Riverwalk Loop', slug: 'riverwalk-loop' },
    { id: 'route-2', name: 'Zoo Loop', slug: 'zoo-loop' },
  ],
  availableLayers: [
    'attractions',
    'bikeResources',
    'bikeRentals',
    'bikeNetwork',
  ],
} satisfies EmbedBuilderConfig;

const baseUrl = 'https://bikechatt.com';

function getSnippetText() {
  return screen.getByText(/<iframe/).closest('pre')?.textContent ?? '';
}

afterEach(() => {
  cleanup();
});

describe('EmbedSnippetBuilder', () => {
  it('defaults to a bare /embed snippet with no query string', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const snippet = getSnippetText();
    expect(snippet).toContain(`${baseUrl}/embed`);
    expect(snippet).not.toContain(`${baseUrl}/embed?`);
  });

  it('adds sidebar=open to the snippet when toggled open', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const sidebarSelect = screen.getByLabelText('Sidebar');
    fireEvent.change(sidebarSelect, { target: { value: 'open' } });

    expect(getSnippetText()).toContain('sidebar=open');
  });

  it('does not boot a map until the preview is asked for', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    // The builder sits on the public About page and each preview boot is a
    // billed Mapbox map load, so nothing loads on render.
    expect(screen.queryByTitle('Bike map preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show live preview' }));

    const iframe = screen.getByTitle('Bike map preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/embed');
  });

  it('loads the preview with the options chosen before it was shown', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    fireEvent.click(screen.getByRole('button', { name: 'Show live preview' }));

    const iframe = screen.getByTitle('Bike map preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/embed?layers=attractions');
  });

  it('only offers layers the city can actually render', () => {
    render(
      <EmbedSnippetBuilder
        baseUrl={baseUrl}
        config={{ ...CONFIG, availableLayers: ['attractions'] }}
      />,
    );

    expect(screen.getByLabelText('Attractions')).toBeInTheDocument();
    // Chattanooga has no bike-network data, so offering it would generate a
    // ?layers= value the map silently ignores.
    expect(screen.queryByLabelText('Bike network')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bike rentals')).not.toBeInTheDocument();
  });

  it('selecting a marker layer emits layers=<that one>', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.click(screen.getByLabelText('Attractions'));

    expect(getSnippetText()).toContain('layers=attractions');
  });

  it('selecting a different marker layer replaces rather than appends', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    expect(getSnippetText()).toContain('layers=attractions');

    fireEvent.click(screen.getByLabelText('Bike rentals'));
    const snippet = getSnippetText();
    expect(snippet).toContain('layers=bikeRentals');
    expect(snippet).not.toContain('attractions');
  });

  it('the bike-network toggle combines with a marker selection', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    fireEvent.click(screen.getByLabelText('Bike network'));

    expect(getSnippetText()).toContain('layers=attractions%2CbikeNetwork');
  });

  it('selecting "None" clears the marker layer but keeps bike network', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.click(screen.getByLabelText('Attractions'));
    fireEvent.click(screen.getByLabelText('Bike network'));
    fireEvent.click(screen.getByLabelText('None'));

    expect(getSnippetText()).toContain('layers=bikeNetwork');
  });

  it('excludes an out-of-range zoom from the snippet and shows a validation message', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '40' } });

    expect(getSnippetText()).not.toContain('zoom=');
    expect(
      screen.getByText('Zoom must be between 0 and 24'),
    ).toBeInTheDocument();
  });

  it('includes an in-range zoom in the snippet with no validation message', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '13' } });

    expect(getSnippetText()).toContain('zoom=13');
    expect(
      screen.queryByText('Zoom must be between 0 and 24'),
    ).not.toBeInTheDocument();
  });

  it('does not show a validation message for transient mid-edit values', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const zoomInput = screen.getByLabelText('Zoom');
    fireEvent.change(zoomInput, { target: { value: '-' } });

    expect(
      screen.queryByText('Zoom must be between 0 and 24'),
    ).not.toBeInTheDocument();
    expect(getSnippetText()).not.toContain('zoom=');
  });

  it('includes a valid center in the snippet', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: '-85.309, 35.046' },
    });

    expect(getSnippetText()).toContain('center=-85.309%2C35.046');
    expect(
      screen.queryByText(/Use longitude, latitude/),
    ).not.toBeInTheDocument();
  });

  it('excludes an out-of-range center and explains the format', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    // Latitude 200 is out of range — the embed's parser would drop it, so the
    // form must not put it in the snippet either.
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: '-85.309, 200' },
    });

    expect(getSnippetText()).not.toContain('center=');
    expect(screen.getByText(/Use longitude, latitude/)).toBeInTheDocument();
  });

  it('treats a cleared center field as unset rather than invalid', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

    const centerInput = screen.getByLabelText('Center');
    fireEvent.change(centerInput, { target: { value: '-85.309, 35.046' } });
    fireEvent.change(centerInput, { target: { value: '' } });

    expect(getSnippetText()).not.toContain('center=');
    expect(
      screen.queryByText(/Use longitude, latitude/),
    ).not.toBeInTheDocument();
  });

  it('debounces the preview iframe navigation instead of remounting on every change', () => {
    vi.useFakeTimers();
    try {
      render(<EmbedSnippetBuilder baseUrl={baseUrl} config={CONFIG} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Show live preview' }),
      );
      const iframe = screen.getByTitle('Bike map preview') as HTMLIFrameElement;
      const initialElement = iframe;

      fireEvent.click(screen.getByLabelText('Attractions'));
      // Snippet text updates immediately, unaffected by the debounce.
      expect(getSnippetText()).toContain('layers=attractions');

      // The iframe element itself is never recreated (no `key` remount).
      expect(screen.getByTitle('Bike map preview')).toBe(initialElement);

      // Advancing past the debounce window should not throw even though
      // jsdom's contentWindow.location.replace is a no-op/unimplemented —
      // the effect must fall back gracefully.
      expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
