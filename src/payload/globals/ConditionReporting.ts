import type { GlobalConfig } from 'payload';

/**
 * The site-wide switch for condition reporting.
 *
 * The outermost of three — this, a trail complex, and a single trail — and any
 * one of them being off closes reporting. Mainly here for a fork that wants the
 * trail data without a public form.
 *
 * Turns off *new reports*, not the display: existing ones stay visible.
 */
export const ConditionReporting: GlobalConfig = {
  slug: 'condition-reporting',
  label: 'Condition reporting',
  admin: {
    description:
      'Whether riders can report trail conditions. Turning this off leaves existing reports visible.',
    group: 'Settings',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Accept condition reports',
      admin: {
        description: 'Untick to close the report form across the whole map.',
      },
    },
    {
      name: 'disabledMessage',
      type: 'textarea',
      label: 'Why (shown to riders)',
      admin: {
        condition: (data) => data?.enabled === false,
        description:
          'Optional, e.g. “Conditions are reported on our forum instead.”',
      },
    },
  ],
};
