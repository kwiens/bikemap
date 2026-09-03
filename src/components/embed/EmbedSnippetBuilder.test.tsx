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

afterEach(() => {
  cleanup();
});

describe('EmbedSnippetBuilder', () => {
  it('defaults to a bare /embed snippet with no query string', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const snippet = screen.getByText(/<iframe/).closest('pre');
    expect(snippet?.textContent).toContain(`${baseUrl}/embed`);
    expect(snippet?.textContent).not.toContain(`${baseUrl}/embed?`);
  });

  it('adds sidebar=open to the snippet and iframe src when toggled open', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const sidebarSelect = screen.getByLabelText('Sidebar');
    fireEvent.change(sidebarSelect, { target: { value: 'open' } });

    const snippet = screen.getByText(/<iframe/).closest('pre');
    expect(snippet?.textContent).toContain('sidebar=open');

    const iframe = screen.getByTitle('Bike map') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toContain('sidebar=open');
  });

  it('adds layers=... when a layer checkbox is checked', () => {
    render(<EmbedSnippetBuilder baseUrl={baseUrl} />);

    const attractionsCheckbox = screen.getByLabelText('Attractions');
    fireEvent.click(attractionsCheckbox);

    const snippet = screen.getByText(/<iframe/).closest('pre');
    expect(snippet?.textContent).toContain('layers=attractions');

    const iframe = screen.getByTitle('Bike map') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toContain('layers=attractions');
  });
});
