/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import {
  buildChartPaths,
  ElevationProfileAdmin,
} from './ElevationProfileAdmin';

const ui = vi.hoisted(() => ({
  dispatch: vi.fn(),
  documentInfo: {
    // Payload supplies the current document URL here, not the API root. Keeping
    // its real shape catches accidental path appends after the draft query.
    apiURL: '/api/trails/42?draft=true',
    data: {} as Record<string, unknown>,
    hasSavePermission: true,
    id: 42 as number | string | undefined,
    incrementVersionCount: vi.fn(),
    isEditing: true,
    setData: vi.fn(),
    setLastUpdateTime: vi.fn(),
  },
  fields: {} as Record<string, { value?: unknown }>,
  isBackgroundProcessing: false,
  isModified: false,
  isProcessing: false,
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  ),
  toast: ui.toast,
  useConfig: () => ({
    config: { routes: { api: '/api' }, serverURL: '' },
  }),
  useDocumentInfo: () => ui.documentInfo,
  useFormBackgroundProcessing: () => ui.isBackgroundProcessing,
  useFormFields: (selector: (form: unknown) => unknown) =>
    selector([ui.fields, ui.dispatch]),
  useFormModified: () => ui.isModified,
  useFormProcessing: () => ui.isProcessing,
}));

const PROFILE: ElevationProfile = {
  distance: 5280,
  gain: 240,
  loss: 180,
  max: 1240,
  min: 1000,
  profile: [
    [0, 1000, -85.3, 35.1],
    [2640, 1240, -85.295, 35.105],
    [5280, 1100, -85.29, 35.11],
  ],
  trail: 'Test Trail',
};

const GEOMETRY = {
  coordinates: [
    [
      [-85.3, 35.1],
      [-85.29, 35.11],
    ],
  ],
  type: 'MultiLineString',
};

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  ui.fields = {
    bounds: { value: [-85.3, 35.1, -85.29, 35.11] },
    distance: { value: 1 },
    elevationGain: { value: 240 },
    elevationLoss: { value: 180 },
    elevationMax: { value: 1240 },
    elevationMin: { value: 1000 },
    elevationProfile: { value: PROFILE },
    geom: { value: GEOMETRY },
  };
  ui.documentInfo.data = {};
  ui.documentInfo.hasSavePermission = true;
  ui.documentInfo.id = 42;
  ui.documentInfo.isEditing = true;
  ui.isBackgroundProcessing = false;
  ui.isModified = false;
  ui.isProcessing = false;
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('ElevationProfileAdmin', () => {
  it('shows the stored chart and rider-facing measurements', () => {
    render(<ElevationProfileAdmin />);

    expect(
      screen.getByRole('img', { name: /elevation profile for test trail/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('1.00 mi')).toHaveLength(2);
    expect(screen.getByText('240 ft')).toBeInTheDocument();
    expect(screen.getByText('180 ft')).toBeInTheDocument();
    expect(screen.getByText('1,000 ft–1,240 ft')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Terrain samples riders see on the map. Recalculate from topo elevations along the track.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/saves immediately—no separate draft save is needed/i),
    ).toBeInTheDocument();
  });

  it('reads the hidden profile from document data when it is absent from form state', () => {
    delete ui.fields.elevationProfile;
    ui.documentInfo.data = { elevationProfile: PROFILE };

    render(<ElevationProfileAdmin />);

    expect(
      screen.getByRole('img', { name: /elevation profile for test trail/i }),
    ).toBeInTheDocument();
  });

  it('recalculates and puts the returned values into the open form', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        measurements: {
          bounds: [-85.3, 35.1, -85.29, 35.11],
          distance: 1,
          elevationGain: 300,
          elevationLoss: 220,
          elevationMax: 1300,
          elevationMin: 990,
        },
        message: 'Elevation profile recalculated and saved.',
        profile: { ...PROFILE, gain: 300, loss: 220, max: 1300, min: 990 },
        updatedAt: '2026-09-19T12:00:00.000Z',
      }),
    ) as typeof fetch;

    fireEvent.click(
      render(<ElevationProfileAdmin />).getByRole('button', {
        name: /recalculate elevation/i,
      }),
    );

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/trails/42/recalculate-elevation',
        expect.objectContaining({
          credentials: 'same-origin',
          method: 'POST',
          signal: expect.anything(),
        }),
      ),
    );
    expect(ui.dispatch).toHaveBeenCalledTimes(7);
    expect(ui.dispatch).toHaveBeenCalledWith({
      initialValue: 220,
      modified: false,
      path: 'elevationLoss',
      type: 'UPDATE',
      value: 220,
    });
    expect(ui.documentInfo.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        elevationGain: 300,
        elevationLoss: 220,
        elevationProfile: expect.objectContaining({ gain: 300 }),
      }),
    );
    expect(ui.toast.success).toHaveBeenCalledWith(
      'Elevation profile recalculated and saved.',
    );
  });

  it('repopulates a bundled profile when the trail has no CMS geometry', async () => {
    ui.fields.geom = { value: null };
    delete ui.fields.elevationProfile;
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        measurements: {
          bounds: [-85.3, 35.1, -85.29, 35.11],
          distance: 1,
          elevationGain: 240,
          elevationLoss: 180,
          elevationMax: 1240,
          elevationMin: 1000,
        },
        message: 'Bundled elevation profile repopulated and saved.',
        profile: PROFILE,
        updatedAt: '2026-09-19T12:00:00.000Z',
      }),
    ) as typeof fetch;

    const view = render(<ElevationProfileAdmin />);
    const action = view.getByRole('button', {
      name: /repopulate elevation/i,
    });

    expect(action).toBeEnabled();
    expect(
      screen.getByText(/restore the bundled profile/i),
    ).toBeInTheDocument();
    fireEvent.click(action);

    await waitFor(() =>
      expect(ui.toast.success).toHaveBeenCalledWith(
        'Bundled elevation profile repopulated and saved.',
      ),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/trails/42/recalculate-elevation',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requires unsaved geometry changes to be saved first', () => {
    ui.isModified = true;

    render(<ElevationProfileAdmin />);

    expect(
      screen.getByRole('button', { name: /recalculate elevation/i }),
    ).toBeDisabled();
    expect(screen.getByText(/save the trail first/i)).toBeInTheDocument();
  });

  it('does not run alongside a form save', () => {
    ui.isProcessing = true;

    render(<ElevationProfileAdmin />);

    expect(
      screen.getByRole('button', { name: /recalculate elevation/i }),
    ).toBeDisabled();
    expect(screen.getByText(/wait for the current save/i)).toBeInTheDocument();
  });

  it('rejects a malformed success response before updating form state', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        measurements: { distance: 1 },
        message: 'Elevation profile recalculated and saved.',
        profile: { profile: [] },
        updatedAt: '2026-09-19T12:00:00.000Z',
      }),
    ) as typeof fetch;

    fireEvent.click(
      render(<ElevationProfileAdmin />).getByRole('button', {
        name: /recalculate elevation/i,
      }),
    );

    await waitFor(() => expect(ui.toast.error).toHaveBeenCalledOnce());
    expect(ui.dispatch).not.toHaveBeenCalled();
    expect(ui.documentInfo.setData).not.toHaveBeenCalled();
  });

  it('aborts a recalculation when the admin navigates to another trail', async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    ) as typeof fetch;
    const view = render(<ElevationProfileAdmin />);

    fireEvent.click(
      view.getByRole('button', { name: /recalculate elevation/i }),
    );
    ui.documentInfo.id = 43;
    view.rerender(<ElevationProfileAdmin />);

    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(ui.documentInfo.setData).not.toHaveBeenCalled();
    expect(ui.toast.error).not.toHaveBeenCalled();
  });
});

describe('buildChartPaths', () => {
  it('does not draw across a disconnected geometry gap', () => {
    const split: ElevationProfile = {
      ...PROFILE,
      geometryGapDetails: [
        {
          feet: 1000,
          from: [-85.295, 35.105],
          to: [-85.29, 35.11],
        },
      ],
    };

    const paths = buildChartPaths(split);

    expect(paths.line.match(/M/g)).toHaveLength(2);
    expect(paths.area.match(/Z/g)).toHaveLength(2);
  });
});
