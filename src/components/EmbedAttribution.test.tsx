/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbedProvider } from './EmbedContext';
import { EmbedAttribution } from './EmbedAttribution';
import { DEFAULT_EMBED_OPTIONS } from '@/utils/embed';
import { mapSelectionHarness } from '@/test/map-selection';
import { siteConfig } from '@/config/site.config';

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [
    { trailName: 'New Trail', slug: 'saved-trail-slug' },
  ],
}));
vi.mock('@/data/route-source', () => ({
  getBikeRoutes: () => [{ id: 'route-layer', name: 'New Route' }],
}));

const selection = mapSelectionHarness();

afterEach(cleanup);

describe('EmbedAttribution', () => {
  it('follows trail selection and clearing using the saved CMS slug', () => {
    render(
      <EmbedProvider
        options={{ ...DEFAULT_EMBED_OPTIONS, mode: 'mtb', trail: 'initial' }}
      >
        <EmbedAttribution />
      </EmbedProvider>,
      { wrapper: selection.Wrapper },
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', siteConfig.url);
    selection.select({ kind: 'trail', trailName: 'New Trail' });
    expect(link).toHaveAttribute(
      'href',
      new URL('?trail=saved-trail-slug', siteConfig.url).toString(),
    );
    selection.select(null);
    expect(link).toHaveAttribute('href', siteConfig.url);
  });

  it('follows casual route selection and clearing', () => {
    render(
      <EmbedProvider options={DEFAULT_EMBED_OPTIONS}>
        <EmbedAttribution />
      </EmbedProvider>,
      { wrapper: selection.Wrapper },
    );
    const link = screen.getByRole('link');
    selection.select({ kind: 'route', routeId: 'route-layer' });
    expect(link).toHaveAttribute(
      'href',
      new URL('?route=route-layer', siteConfig.url).toString(),
    );
    selection.select(null);
    expect(link).toHaveAttribute('href', siteConfig.url);
  });
});
