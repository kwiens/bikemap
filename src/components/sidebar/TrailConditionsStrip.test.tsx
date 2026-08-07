import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrailConditionsStrip } from './TrailConditionsStrip';
import type { ConditionReport } from '@/data/trail-conditions';
import { MAP_EVENTS } from '@/events';

/**
 * What a rider can do on a trail that is, or is not, taking reports.
 *
 * The lock only hides the button — the server is what actually refuses a POST —
 * so what these check is the promise made alongside it: that closing reports
 * does not also hide what has already been reported.
 */

const lockedReason = vi.fn<(slug: string) => null | string>(() => null);

const fresh: ConditionReport = {
  color: '#b45309',
  name: 'Muddy — stay off',
  observedAt: new Date().toISOString(),
  source: 'public',
  value: 'muddy',
};

vi.mock('@/components/TrailConditionsProvider', () => ({
  useTrailConditions: () => ({
    latest: { pondo: fresh },
    loading: false,
    lockedReason,
    options: [{ color: '#16a34a', name: 'Dry', value: 'dry' }],
    recordLocal: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function renderStrip() {
  return render(<TrailConditionsStrip slug="pondo" trailName="Pondo" />);
}

describe('TrailConditionsStrip', () => {
  beforeEach(() => {
    lockedReason.mockReset();
    lockedReason.mockReturnValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ reports: [] }),
      ok: true,
    }) as unknown as typeof fetch;
  });

  it('offers the report button when the trail is open', () => {
    renderStrip();
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument();
  });

  it('dispatches CONDITION_REPORT_OPEN with the slug and name', () => {
    const listener = vi.fn();
    window.addEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, listener);

    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: /report/i }));

    expect(listener).toHaveBeenCalled();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: 'pondo', trailName: 'Pondo' });

    window.removeEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, listener);
  });

  it('replaces the button with the steward’s note when locked', () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderStrip();

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
    renderStrip();

    expect(screen.getByText('Muddy — stay off')).toBeInTheDocument();
  });

  it('keeps the history open while locked', () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderStrip();

    expect(
      screen.getByRole('button', { name: /history/i }),
    ).toBeInTheDocument();
  });

  it('stops inviting a report the trail will not take', async () => {
    lockedReason.mockReturnValue('Closed for logging until 1 May.');
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    expect(await screen.findByText('Nothing reported.')).toBeInTheDocument();
    expect(screen.queryByText(/Ridden it lately/)).not.toBeInTheDocument();
  });

  it('does invite one when the trail is open', async () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    expect(await screen.findByText(/Ridden it lately/)).toBeInTheDocument();
  });
});
