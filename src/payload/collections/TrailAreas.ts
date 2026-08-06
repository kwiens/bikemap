import type { CollectionConfig } from 'payload';

/**
 * Recreation areas — the places trails are grouped under in the sidebar
 * ("Phil's Trail Complex", "Stringers Ridge").
 *
 * This was free text on Trails, which meant a typo silently created a new
 * grouping that looked real in the UI. As a collection the options are picked,
 * not typed, and renaming one updates every trail at once.
 *
 * It also moves `region` out of code. The sidebar groups areas into regions
 * ("Bend", "Cascade Lakes"), and that mapping lived in a hardcoded `REGION_MAP`
 * per city — so adding an area meant editing TypeScript. Storing it here makes
 * it editable, and the app falls back to the hardcoded map for any trail
 * without one.
 */
export const TrailAreas: CollectionConfig = {
  slug: 'trail-areas',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'region', 'city'],
    description:
      'Recreation areas trails are grouped under. Anything added here becomes selectable on a trail.',
    group: 'Map content',
    listSearchableFields: ['name', 'region'],
  },
  access: {
    // Shared reference data: any signed-in editor may read, admins curate.
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
          index: true,
          admin: {
            description:
              'As shown in the sidebar, e.g. "Phil\'s Trail Complex".',
            width: '60%',
          },
        },
        {
          name: 'city',
          type: 'select',
          required: true,
          options: [
            { label: 'Chattanooga', value: 'chattanooga' },
            { label: 'Bend', value: 'bend' },
          ],
          admin: { width: '40%' },
        },
      ],
    },
    {
      name: 'region',
      type: 'text',
      index: true,
      admin: {
        description:
          'The heading this area sits under in the sidebar, e.g. "Bend" or "Lookout Mountain". Leave blank to use the built-in mapping.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Optional.' },
    },
  ],
};
