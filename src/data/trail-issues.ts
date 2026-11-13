export const TRAIL_ISSUE_TYPES = [
  { value: 'down-tree', label: 'Down tree' },
  { value: 'washed-out', label: 'Washed out' },
  { value: 'broken-feature', label: 'Broken feature' },
  { value: 'missing-sign', label: 'Missing sign' },
  { value: 'other', label: 'Other' },
] as const;

export type TrailIssueType = (typeof TRAIL_ISSUE_TYPES)[number]['value'];

export function isTrailIssueType(value: unknown): value is TrailIssueType {
  return TRAIL_ISSUE_TYPES.some((type) => type.value === value);
}

export const ISSUE_COMMENT_LIMIT = 1000;
export const ISSUE_PHOTO_MAX_BYTES = 3_000_000;
export const ISSUE_PHOTO_MAX_EDGE = 1600;
