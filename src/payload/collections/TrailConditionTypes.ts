import type { CollectionConfig } from 'payload';
import { slugValidator, valueField } from './vocabulary-fields';

/**
 * The options behind the dropdown on the public report form.
 *
 * Curated like trail-ratings because conditions are local: "Dusty / loose"
 * matters in Bend in August and nowhere in a Tennessee spring.
 */
export const TrailConditionTypes: CollectionConfig = {
  slug: 'trail-condition-types',
  labels: {
    plural: 'Trail conditions',
    singular: 'Trail condition',
  },
  // Best to worst, so the rider's dropdown reads as a scale.
  defaultSort: 'sortOrder',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'value', 'color', 'sortOrder', 'active'],
    description:
      'What riders can report a trail as being. Anything added here becomes selectable on the report form.',
    group: 'Lists',
    listSearchableFields: ['name', 'value'],
  },
  access: {
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
            description: 'As riders see it, e.g. "Muddy — stay off".',
            width: '50%',
          },
        },
        valueField(
          'The stable key the map matches on, e.g. "muddy". Lowercase and dashes.',
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
            description: 'The badge colour.',
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
            description: 'Low to high, best first. Orders the dropdown.',
            width: '50%',
          },
        },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Offer this on the report form',
      admin: {
        description:
          'Untick to retire an option. Deleting one that past reports use is blocked.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'What this means locally. Optional.' },
    },
  ],
};
