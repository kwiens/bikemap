/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeometrySourceField } from './GeometrySourceField';
import { OsmBuildReport } from './OsmBuildReport';

const ui = vi.hoisted(() => ({
  fields: {} as Record<string, { value?: unknown }>,
}));

vi.mock('@payloadcms/ui', () => ({
  useField: ({ path }: { path: string }) => ui.fields[path] ?? {},
  useFormFields: (selector: (form: unknown) => unknown) =>
    selector([ui.fields, vi.fn()]),
}));

const GEOMETRY = {
  coordinates: [
    [
      [-85.3, 35.1],
      [-85.29, 35.11],
    ],
  ],
  type: 'MultiLineString',
};

beforeEach(() => {
  ui.fields = {
    geom: { value: null },
    geometrySource: { value: 'osm' },
    osmIds: { value: [] },
    osmReport: { value: null },
  };
});

describe('GeometrySourceField', () => {
  it('explains that an OpenStreetMap line must be refreshed before saving', () => {
    render(<GeometrySourceField path="geometrySource" />);

    expect(screen.getByText('OpenStreetMap')).toBeInTheDocument();
    expect(
      screen.getByText(/refresh and review the line, then save it/i),
    ).toBeInTheDocument();
  });

  it('distinguishes a public imported line from an editable stored line', () => {
    ui.fields.geometrySource = { value: 'imported' };

    render(<GeometrySourceField path="geometrySource" />);

    expect(screen.getByText('Imported map line')).toBeInTheDocument();
    expect(
      screen.getByText(/no editable line is stored here/i),
    ).toBeInTheDocument();
  });
});

describe('OsmBuildReport', () => {
  it('turns selected OpenStreetMap segments into a clear next step', () => {
    ui.fields.osmIds = { value: [101, 202] };

    render(<OsmBuildReport path="osmReport" />);

    expect(screen.getByText('Ready to refresh')).toBeInTheDocument();
    expect(
      screen.getByText(/refresh the line.*review the preview.*then save/i),
    ).toBeInTheDocument();
  });

  it('confirms when the built line is stored with the trail', () => {
    ui.fields.geom = { value: GEOMETRY };
    ui.fields.osmIds = { value: [101, 202] };
    ui.fields.osmReport = {
      value: {
        builtAt: '2026-09-20T12:00:00.000Z',
        gaps: [],
        resolvedIds: [101, 202],
        source: 'osm',
        warnings: [],
      },
    };

    render(<OsmBuildReport path="osmReport" />);

    expect(screen.getByText('Stored with trail')).toBeInTheDocument();
    expect(
      screen.getByText(/joining 2 OpenStreetMap segments/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no problems found/i)).toBeInTheDocument();
  });
});
