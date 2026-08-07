import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ConditionReportModal } from './ConditionReportModal';
import { MAP_EVENTS } from '@/events';

const recordLocal = vi.fn();
const refresh = vi.fn();

vi.mock('@/components/TrailConditionsProvider', () => ({
  useTrailConditions: () => ({
    latest: {},
    loading: false,
    options: [
      { color: '#16a34a', name: 'Dry', value: 'dry' },
      {
        color: '#b45309',
        description: 'Soft enough to rut.',
        name: 'Muddy — stay off',
        value: 'muddy',
      },
    ],
    recordLocal,
    refresh,
  }),
}));

/** Opens the form the way the elevation pane does. */
function open(trailName = 'Pondo', slug = 'pondo') {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.CONDITION_REPORT_OPEN, {
        detail: { slug, trailName },
      }),
    );
  });
}

function mockFetch(response: { body: Record<string, unknown>; ok: boolean }) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => response.body,
    ok: response.ok,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ConditionReportModal', () => {
  beforeEach(() => {
    recordLocal.mockClear();
    refresh.mockClear();
  });

  it('renders nothing until asked to open', () => {
    render(<ConditionReportModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the event, naming the trail', () => {
    render(<ConditionReportModal />);
    open();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Pondo')).toBeInTheDocument();
  });

  it('posts the slug, condition and date, then records the report locally', async () => {
    const report = {
      color: '#b45309',
      name: 'Muddy — stay off',
      observedAt: '2026-08-07T00:00:00.000Z',
      source: 'public',
      value: 'muddy',
    };
    const fetchMock = mockFetch({ body: { ok: true, report }, ok: true });

    render(<ConditionReportModal />);
    open();

    fireEvent.change(screen.getByLabelText('Condition'), {
      target: { value: 'muddy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/map/conditions?city=');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.slug).toBe('pondo');
    expect(body.condition).toBe('muddy');
    expect(body.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The honeypot must go out empty — a bot filling it is the only way it is
    // ever anything else.
    expect(body.website).toBe('');

    await waitFor(() =>
      expect(recordLocal).toHaveBeenCalledWith('pondo', report),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('shows the server’s message on a rate limit, and stays open', async () => {
    mockFetch({
      body: { error: 'That is 5 reports in an hour, which is our limit.' },
      ok: false,
    });

    render(<ConditionReportModal />);
    open();

    fireEvent.change(screen.getByLabelText('Condition'), {
      target: { value: 'dry' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    // The server writes these to be read by a person; inventing a generic
    // message instead would drop the only explanation the rider gets.
    expect(await screen.findByText(/5 reports in an hour/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(recordLocal).not.toHaveBeenCalled();
  });

  it('sends nothing without a condition', () => {
    const fetchMock = mockFetch({ body: { ok: true }, ok: true });

    render(<ConditionReportModal />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    // The `required` select stops the submit before the handler runs, which is
    // why the assertion is on the absence of a request rather than on the
    // handler's own "Pick a condition." message — that one is the fallback for
    // a programmatic submit, not what a person sees.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Condition')).toBeInvalid();
  });

  it('shows the curator’s description for the chosen condition', () => {
    render(<ConditionReportModal />);
    open();

    fireEvent.change(screen.getByLabelText('Condition'), {
      target: { value: 'muddy' },
    });

    expect(screen.getByText('Soft enough to rut.')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<ConditionReportModal />);
    open();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
