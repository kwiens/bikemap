/** @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
  const { latest, historyRevision, recordLocal, refresh } =
    useTrailConditions();
  return (
    <>
      <output>{latest.trail?.value ?? 'loading'}</output>
      <span data-testid="history-revision">{historyRevision}</span>
      <button onClick={() => recordLocal('trail', local)}>Report</button>
      <button onClick={refresh}>Refresh</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
    expect(screen.getByTestId('history-revision')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    expect(screen.getByTestId('history-revision')).toHaveTextContent('1');

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
    expect(screen.getByTestId('history-revision')).toHaveTextContent('1');
  });
});

describe('condition updates during a ride', () => {
  it('fetches new closures while visible, pauses while hidden, and refreshes on return', async () => {
    vi.useFakeTimers();
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
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const view = render(
      <TrailConditionsProvider>
        <Reports local={report(3, 'wet')} />
      </TrailConditionsProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('dry');
    current = report(2, 'closed');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    visibility.mockReturnValue('hidden');
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    current = report(3, 'wet');
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('wet');
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
