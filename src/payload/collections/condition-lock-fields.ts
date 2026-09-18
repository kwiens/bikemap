import type { Field } from 'payload';

/**
 * The "closed to new reports" pair, shared by Trails and trail complexes.
 *
 * Named for the exception, not the rule: `conditionReportsClosed` defaults to
 * false, so rows written before this field existed (NULL) read as open.
 */
export function conditionLockFields(scope: {
  /** What ticking the box switches off, e.g. "for this trail". */
  effect: string;
  /** An example note for this level. */
  example: string;
}): Field[] {
  return [
    {
      name: 'conditionReportsClosed',
      type: 'checkbox',
      defaultValue: false,
      label: 'Closed to new reports',
      index: true,
      admin: {
        description: `Stops new condition reports ${scope.effect}. Existing reports stay visible.`,
      },
    },
    {
      name: 'conditionReportsNote',
      type: 'textarea',
      label: 'Why (shown to riders)',
      admin: {
        condition: (data) => data?.conditionReportsClosed === true,
        description: `Optional, e.g. “${scope.example}” Shown in place of the Report button.`,
      },
    },
  ];
}
