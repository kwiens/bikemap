import type { CollectionConfig } from 'payload';

/**
 * Trail organizations — the clubs and agencies that build and maintain trails
 * (COTA in Bend, SORBA around Chattanooga, land managers, and so on).
 *
 * This exists as its own collection rather than a hardcoded `select` on Trails
 * so the options are editable in the admin, at
 * `/admin/collections/organizations`, without a deploy. Trails reference it
 * through a `relationship` field, which Payload renders as a searchable
 * dropdown and keeps referentially honest — renaming an org here updates every
 * trail pointing at it, and Payload blocks deleting one that's still in use.
 */
export const Organizations: CollectionConfig = {
  slug: 'organizations',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'abbreviation', 'city', 'url'],
    description:
      'The clubs and agencies that maintain trails. Anything added here becomes selectable on a trail.',
    group: 'Map content',
    listSearchableFields: ['name', 'abbreviation'],
  },
  access: {
    // Options are shared reference data, so any signed-in editor may read them,
    // but changing the list is an admin decision.
    create: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          unique: true,
          admin: {
            description: 'Full name, e.g. "Central Oregon Trail Alliance".',
            width: '65%',
          },
        },
        {
          name: 'abbreviation',
          type: 'text',
          admin: {
            description: 'e.g. "COTA". Shown where space is tight.',
            width: '35%',
          },
        },
      ],
    },
    {
      name: 'city',
      type: 'select',
      options: [
        { label: 'Chattanooga', value: 'chattanooga' },
        { label: 'Bend', value: 'bend' },
      ],
      admin: {
        description:
          'Optional. Leave blank for an organization that works across several cities.',
      },
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'Where riders can find them — membership, trail reports.',
      },
      validate: (value: unknown): string | true => {
        if (!value) {
          return true;
        }
        try {
          const { protocol } = new URL(String(value));
          return protocol === 'http:' || protocol === 'https:'
            ? true
            : 'Must be an http or https URL.';
        } catch {
          return 'Must be a full URL, including https://';
        }
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'A sentence or two. Optional.',
      },
    },
  ],
};
