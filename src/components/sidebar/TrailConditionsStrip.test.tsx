/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EmbedProvider } from '@/components/EmbedContext';
import { DEFAULT_EMBED_OPTIONS } from '@/utils/embed';
import { ElevationProfile } from './ElevationProfile';
import type { ConditionReport } from '@/data/trail-conditions';
import { dispatchMapEvent, MAP_EVENTS } from '@/events';

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [{ trailName: 'Pondo', slug: 'pondo' }],
}));

/**
 * What a rider can do on a trail that is, or is not, taking reports.
 *
 * The lock only hides the button — the server is what actually refuses a POST —
 * so what these check is the promise made alongside it: that closing reports
 * does not also hide what has already been reported.
 */

let historyRevision = 0;

const lockedReason = vi.fn<(slug: string) => null | string>(() => null);

const fresh: ConditionReport = {
  color: '#b45309',
  marksClosed: false,
  name: 'Muddy — stay off',
  id: 1,
  createdAt: new Date().toISOString(),
  observedAt: new Date().toISOString(),
  source: 'public',
  value: 'muddy',
};

vi.mock('@/components/TrailConditionsProvider', () => ({
  useTrailConditions: () => ({
    latest: { pondo: fresh },
    historyRevision,
    loading: false,
    lockedReason,
    options: [{ color: '#16a34a', name: 'Dry', value: 'dry' }],
    recordLocal: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function openActions() {
  act(() => dispatchMapEvent(MAP_EVENTS.TRAIL_SELECT, { trailName: 'Pondo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
}

function renderActions() {
  const view = render(<ElevationProfile />);
  openActions();
  return view;
}

describe('Trail condition actions', () => {
  beforeEach(() => {
    historyRevision = 0;
    lockedReason.mockReset();
    lockedReason.mockReturnValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/map/conditions/')
          ? { json: async () => ({ reports: [] }), ok: true }
          : { ok: false, status: 404 },
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes already-open history after a submission, even if the badge is unchanged', async () => {
    const view = renderActions();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await screen.findByText('Nothing reported yet. Ridden it lately?');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        reports: [{ ...fresh, id: 2, name: 'Older observation just filed' }],
      }),
    } as Response);
    historyRevision += 1;
    view.rerender(<ElevationProfile />);
    await screen.findByText('Older observation just filed');
    const historyCalls = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          String(url).startsWith('/api/map/conditions/'),
        );
    expect(historyCalls()).toHaveLength(2);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('button', { name: 'History' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(historyCalls()).toHaveLength(3));
  });

  it('offers the report button when the trail is open', () => {
    renderActions();
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument();
  });

  it('dispatches CONDITION_REPORT_OPEN with the slug and name', () => {
    const listener = vi.fn();
    window.addEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, listener);

    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /report/i }));

    expect(listener).toHaveBeenCalled();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: 'pondo', trailName: 'Pondo' });

    window.removeEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, listener);
  });

  it('replaces the button with the steward’s note when locked', () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderActions();

    expect(
      screen.queryByRole('button', { name: /report/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Closed for logging until 1 May.'),
    ).toBeInTheDocument();
  });

  it('keeps showing the current condition while locked', () => {
    // The whole point of not hiding conditions on a closed trail: knowing it is
    // shut, and what it was like, is the most useful thing on the page.
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderActions();

    expect(screen.getByText('Muddy — stay off')).toBeInTheDocument();
  });

  it('keeps the history open while locked', () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderActions();

    expect(
      screen.getByRole('button', { name: /history/i }),
    ).toBeInTheDocument();
  });

  it('stops inviting a report the trail will not take', async () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    expect(await screen.findByText('Nothing reported.')).toBeInTheDocument();
    expect(screen.queryByText(/Ridden it lately/)).not.toBeInTheDocument();
  });

  it('does invite one when the trail is open', async () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    expect(await screen.findByText(/Ridden it lately/)).toBeInTheDocument();
  });

  it('is read-only in an embed, which has no report form', async () => {
    render(
      <EmbedProvider options={{ ...DEFAULT_EMBED_OPTIONS, mode: 'mtb' }}>
        <ElevationProfile />
      </EmbedProvider>,
    );
    openActions();

    expect(
      screen.queryByRole('button', { name: /report/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Muddy — stay off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(await screen.findByText('Nothing reported.')).toBeInTheDocument();
  });
});
