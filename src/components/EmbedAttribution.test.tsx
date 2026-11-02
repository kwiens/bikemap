/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbedProvider } from './EmbedContext';
import { EmbedAttribution } from './EmbedAttribution';
import { DEFAULT_EMBED_OPTIONS } from '@/utils/embed';
import { MAP_EVENTS } from '@/events';
import { siteConfig } from '@/config/site.config';

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [
    { trailName: 'New Trail', slug: 'saved-trail-slug' },
  ],
}));
vi.mock('@/data/route-source', () => ({
  getBikeRoutes: () => [{ id: 'route-layer', name: 'New Route' }],
}));

afterEach(cleanup);

describe('EmbedAttribution', () => {
  it('follows trail selection and clearing using the saved CMS slug', () => {
    render(
      <EmbedProvider
        options={{ ...DEFAULT_EMBED_OPTIONS, mode: 'mtb', trail: 'initial' }}
      >
        <EmbedAttribution />
      </EmbedProvider>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `${siteConfig.url}?trail=initial`);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'New Trail' },
        }),
      );
    });
    expect(link).toHaveAttribute(
      'href',
      `${siteConfig.url}?trail=saved-trail-slug`,
    );
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
    });
    expect(link).toHaveAttribute('href', siteConfig.url);
  });

  it('follows casual route selection and clearing', () => {
    render(
      <EmbedProvider options={DEFAULT_EMBED_OPTIONS}>
        <EmbedAttribution />
      </EmbedProvider>,
    );
    const link = screen.getByRole('link');
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
          detail: { routeId: 'route-layer' },
        }),
      );
    });
    expect(link).toHaveAttribute('href', `${siteConfig.url}?route=new-route`);
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
    });
    expect(link).toHaveAttribute('href', siteConfig.url);
  });
});
