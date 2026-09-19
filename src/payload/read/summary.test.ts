import { describe, expect, it } from 'vitest';
import { summarizeTrails } from './summary-model';

describe('summarizeTrails', () => {
  it('combines ordered metadata with the two issue counts', () => {
    const summary = summarizeTrails(
      'bend',
      [
        {
          _status: 'published',
          displayName: 'No line',
          id: 1,
          osmReport: { warnings: ['Missing way'] },
        },
        {
          _status: 'published',
          displayName: 'No chart',
          id: 2,
        },
        {
          _status: 'draft',
          displayName: 'Work in progress',
          id: 3,
        },
      ],
      { missingGeometry: 1, missingProfile: 1 },
    );

    expect(summary).toMatchObject({
      city: 'bend',
      drafts: 1,
      missingGeometry: 1,
      missingProfile: 1,
      published: 2,
      unavailable: false,
      withWarnings: 1,
    });
    expect(summary.recent.map(({ name }) => name)).toEqual([
      'No line',
      'No chart',
      'Work in progress',
    ]);
  });
});
