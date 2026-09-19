import type { CollectionConfig } from 'payload';
import { slugValidator, valueField } from './vocabulary-fields';

/**
 * Difficulty ratings — the green/blue/black vocabulary trails are graded with.
 *
 * This was a hardcoded `select` on Trails, so adding a band (a "double black",
 * or a local grading scheme) meant editing TypeScript, writing a migration for
 * the Postgres enum, and deploying. As a collection it is curated in the admin,
 * and the **colour comes with it** — the palette used to live in code for the
 * same reason, and recolouring "advanced" is now an edit rather than a release.
 *
 * Trails reference this through a `relationship`, so renaming a rating updates
 * every trail at once and Payload blocks deleting one still in use.
 */
export const TrailRatings: CollectionConfig = {
  slug: 'trail-ratings',
  labels: {
    plural: 'Trail ratings',
    singular: 'Trail rating',
  },
  // Difficulty order, so the list and every dropdown read easy → expert rather
  // than alphabetically, which puts Advanced before Easy.
  defaultSort: 'sortOrder',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'value', 'color', 'sortOrder'],
    description:
      'How trails are graded, and the colour each grade draws in. Anything added here becomes selectable on a trail.',
    group: 'Lists',
    listSearchableFields: ['name', 'value'],
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
          unique: true,
          admin: {
            description: 'As shown in the admin, e.g. "Intermediate".',
            width: '50%',
          },
        },
        valueField(
          'The stable key the map and sidebar match on, e.g. "intermediate". Lowercase and dashes.',
        ),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'color',
          type: 'text',
          required: true,
          defaultValue: '#6b7280',
          admin: {
            components: { Field: '@/payload/components/ColorField#ColorField' },
            description: 'The colour trails with this rating draw in.',
            width: '50%',
          },
          validate: slugValidator.color,
        },
        {
          name: 'sortOrder',
          type: 'number',
          required: true,
          defaultValue: 50,
          label: 'Sort order',
          admin: {
            description:
              'Low to high, easiest first. Orders this list and the dropdown on a trail.',
            width: '50%',
          },
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'What this grade means locally. Optional.' },
    },
  ],
};
