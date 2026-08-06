import type { CollectionConfig } from 'payload';
import { activeCityId } from '@/config/map.config';

/**
 * Trail complexes — the places trails are grouped under in the sidebar
 * ("Phil's Trail Complex", "Swampy Lakes", "Stringers Ridge").
 *
 * The sidebar hierarchy is **region → trail complex → trail**, and this is the
 * middle level.
 *
 * This was free text on Trails, which meant a typo silently created a new
 * grouping that looked real in the UI. As a collection the options are picked,
 * not typed, and renaming one updates every trail at once.
 *
 * It also moves `region` out of code. The sidebar groups complexes into regions
 * ("Bend", "Cascade Lakes"), and that mapping lived in a hardcoded `REGION_MAP`
 * per city — so adding a complex meant editing TypeScript. Storing it here
 * makes it editable, and the app falls back to the hardcoded map for anything
 * without one.
 *
 * **The slug and table are still `trail-areas`.** Only the labels changed, so
 * the rename needed no migration; `recArea` is likewise still the field name
 * carried through the app and the checked-in data files.
 */
export const TrailAreas: CollectionConfig = {
  slug: 'trail-areas',
  labels: {
    plural: 'Trail complexes',
    singular: 'Trail complex',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'region'],
    description:
      'Trail complexes trails are grouped under, and the region each sits in. Anything added here becomes selectable on a trail.',
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
          label: 'Complex name',
          admin: {
            description:
              'As shown in the sidebar, e.g. "Phil\'s Trail Complex".',
            width: '100%',
          },
        },
        {
          name: 'city',
          type: 'select',
          required: true,
          defaultValue: activeCityId,
          options: [
            { label: 'Chattanooga', value: 'chattanooga' },
            { label: 'Bend', value: 'bend' },
          ],
          // Hidden: a deployment serves one city. The column stays so
          // complexes remain scoped per city and a multi-city admin only needs
          // `hidden` removed.
          admin: { hidden: true },
        },
      ],
    },
    {
      name: 'region',
      type: 'text',
      index: true,
      admin: {
        description:
          'The heading this complex sits under in the sidebar — the level above it, e.g. "Bend" or "Cascade Lakes". Leave blank to use the built-in mapping.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Optional.' },
    },
  ],
};
