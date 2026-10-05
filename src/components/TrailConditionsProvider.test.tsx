/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConditionReport } from '@/data/trail-conditions';
import {
  TrailConditionsProvider,
  useTrailConditions,
} from './TrailConditionsProvider';

function report(
  id: number,
  value: string,
  observedAt = '2026-09-19T12:00:00Z',
): ConditionReport {
  return {
    id,
    createdAt: `2026-09-19T1${id}:00:00Z`,
    observedAt,
    value,
    name: value,
    color: '#000000',
    source: 'public',
    marksClosed: value === 'closed',
  };
}

function Reports({ local }: { local: ConditionReport }) {
  const { latest, recordLocal, refresh } = useTrailConditions();
  return (
    <>
      <output>{latest.trail?.value ?? 'loading'}</output>
      <button onClick={() => recordLocal('trail', local)}>Report</button>
      <button onClick={refresh}>Refresh</button>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('condition report ordering', () => {
  it('retains a same-day local closure through stale cache and accepts a later server report', async () => {
    let current = report(1, 'dry');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        latest: { trail: current },
        options: [],
        locked: {},
        reporting: { enabled: true, message: '' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <TrailConditionsProvider>
        <Reports local={report(2, 'closed')} />
      </TrailConditionsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('dry'),
    );

    fireEvent.click(screen.getByText('Report'));
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toHaveTextContent('closed');

    current = report(3, 'wet');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('wet'),
    );
  });

  it('does not reopen a current closure with an older observation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          latest: { trail: report(1, 'closed') },
          options: [],
          locked: {},
          reporting: { enabled: true, message: '' },
        }),
      })),
    );
    render(
      <TrailConditionsProvider>
        <Reports local={report(2, 'dry', '2026-09-18T12:00:00Z')} />
      </TrailConditionsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('closed'),
    );
    fireEvent.click(screen.getByText('Report'));
    expect(screen.getByRole('status')).toHaveTextContent('closed');
  });
});
