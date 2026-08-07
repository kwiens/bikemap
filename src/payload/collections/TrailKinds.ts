import type { CollectionConfig } from 'payload';
import { KIND_ICON_OPTIONS } from '@/data/trail-vocabulary';
import { slugValidator, valueField } from './vocabulary-fields';

/**
 * What sort of thing a trail is — singletrack, greenway, and whatever a city
 * needs next (a doubletrack, a bike park lap, a gravel connector).
 *
 * Like `trail-ratings` this was a hardcoded `select`, and it carries the two
 * things a kind decides about how a trail is drawn:
 *
 * - **Colour**, which is an *override*. Left blank the trail takes its rating's
 *   colour, which is what singletrack does; set, it wins, which is how
 *   greenways come out green whatever their difficulty.
 * - **Icon**, picked from the bundled set. A FontAwesome icon is an object and
 *   can't be stored, so the row holds a key that `iconForKind` maps back.
 */
export const TrailKinds: CollectionConfig = {
  slug: 'trail-kinds',
  labels: {
    plural: 'Trail kinds',
    singular: 'Trail kind',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'value', 'icon', 'color'],
    description:
      'The sorts of trail on the map, and how each is drawn. Anything added here becomes selectable on a trail.',
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
            description: 'As shown in the admin, e.g. "Greenway".',
            width: '50%',
          },
        },
        valueField(
          'The stable key the map matches on, e.g. "greenway". Lowercase and dashes.',
        ),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'icon',
          type: 'select',
          required: true,
          defaultValue: 'mountain',
          options: KIND_ICON_OPTIONS,
          admin: {
            description: 'Marks trails of this kind in the sidebar.',
            width: '50%',
          },
        },
        {
          name: 'color',
          type: 'text',
          admin: {
            components: { Field: '@/payload/components/ColorField#ColorField' },
            description:
              'Optional. Overrides the rating colour — leave blank to let difficulty decide.',
            width: '50%',
          },
          validate: (value: unknown): string | true =>
            // Optional here, unlike on a rating: blank is the normal case and
            // means "use the rating's colour".
            value ? slugValidator.color(value) : true,
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Optional.' },
    },
  ],
};
