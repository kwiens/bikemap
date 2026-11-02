import type { CityId } from '@/data/cities/types';

export interface TrailSummary {
  city: CityId;
  published: null | number;
  drafts: null | number;
  missingGeometry: null | number;
  missingProfile: null | number;
  withWarnings: null | number;
  /** Condition reports filed in the last seven days, hidden ones included. */
  reportsThisWeek: null | number;
  recent: { id: number; name: string }[];
  unavailable: boolean;
}

export interface TrailIssueCounts {
  missingGeometry: number;
  missingProfile: number;
}

interface SummaryTrail {
  _status?: null | string;
  displayName?: null | string;
  id: number;
  osmReport?: unknown;
}

export function summarizeTrails(
  city: CityId,
  trails: SummaryTrail[],
  issues: TrailIssueCounts,
  reportsThisWeek: number,
): TrailSummary {
  let drafts = 0;
  let published = 0;
  let withWarnings = 0;

  for (const trail of trails) {
    const isPublished = trail._status === 'published';
    if (isPublished) {
      published += 1;
    } else {
      drafts += 1;
    }

    const report = trail.osmReport as { warnings?: unknown } | null;
    if (Array.isArray(report?.warnings) && report.warnings.length > 0) {
      withWarnings += 1;
    }
  }

  return {
    city,
    drafts,
    missingGeometry: issues.missingGeometry,
    missingProfile: issues.missingProfile,
    published,
    recent: trails.slice(0, 5).map((trail) => ({
      id: trail.id,
      name: trail.displayName ?? 'Untitled',
    })),
    reportsThisWeek,
    unavailable: false,
    withWarnings,
  };
}
