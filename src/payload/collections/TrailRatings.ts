import type { CollectionConfig } from 'payload';
import {
  invalidatePublicTrailSummariesAfterChange,
  invalidatePublicTrailSummariesAfterDelete,
} from '@/payload/cache/public-trails';
import { slugValidator, valueField } from './vocabulary-fields';

/**
 * Difficulty ratings — the green/blue/black vocabulary trails are graded with.
 *
 * The backing rows mirror `trail-options.config.ts`. They remain a collection
 * because trails use relationships for referential integrity, but the list is
 * hidden and immutable in the admin so configuration cannot drift by city.
 *
 * Trails reference this through a `relationship`, so renaming a rating updates
 * every trail at once and Payload blocks deleting one still in use.
 */
export const TrailRatings: CollectionConfig = {
  slug: 'trail-ratings',
  hooks: {
    afterChange: [invalidatePublicTrailSummariesAfterChange],
    afterDelete: [invalidatePublicTrailSummariesAfterDelete],
  },
  labels: {
    plural: 'Trail ratings',
    singular: 'Trail rating',
  },
  // Difficulty order, so the list and every dropdown read easy → expert rather
  // than alphabetically, which puts Advanced before Easy.
  defaultSort: 'sortOrder',
  admin: {
    hidden: true,
    useAsTitle: 'name',
    defaultColumns: ['name', 'value', 'color', 'sortOrder'],
    description: 'Code-owned trail difficulty options.',
    group: 'Lists',
    listSearchableFields: ['name', 'value'],
  },
  access: {
    // Shared reference data: signed-in editors may resolve relationships, but
    // changes ship through configuration plus a seed or migration.
    create: () => false,
    delete: () => false,
    read: ({ req }) => Boolean(req.user),
    update: () => false,
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
