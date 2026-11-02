import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { cityOptions } from '@/config/map.config';

const assignTrailCity: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const trail = data?.trail ?? originalDoc?.trail;
  const trailId = typeof trail === 'object' && trail ? trail.id : trail;
  if (!trailId) return data;

  // One shared admin serves every city. Derive this from the saved trail even
  // for REST writes and edits, rather than trusting the form or deployment.
  const parent = await req.payload.findByID({
    collection: 'trails',
    id: trailId,
    depth: 0,
    select: { city: true },
    req,
  });
  return { ...data, city: parent.city };
};

/**
 * Condition reports — "Bear Creek was muddy on Saturday".
 *
 * **The admin-only access rules below are deliberate.** Payload mounts its own
 * REST API at /api/trail-conditions, and these rules are what keep it shut. The
 * public write goes through /api/map/conditions, which validates first and then
 * uses the Local API. Relaxing `create` here opens a second, unguarded door.
 *
 * No drafts: a report is written once and never edited, so `hidden` is the whole
 * moderation model. Reports are live as soon as they land — an approval queue
 * would make "is it muddy today?" useless.
 */
export const TrailConditions: CollectionConfig = {
  slug: 'trail-conditions',
  labels: {
    plural: 'Condition reports',
    singular: 'Condition report',
  },
  defaultSort: '-observedAt',
  admin: {
    // No natural title — a trail, a condition and a date are each ambiguous
    // alone. The date at least sorts.
    useAsTitle: 'observedAt',
    defaultColumns: ['observedAt', 'trail', 'condition', 'source', 'hidden'],
    description:
      'What riders have reported. These are live on the map as soon as they arrive — tick “Hidden” to take one down.',
    group: 'Conditions',
  },
  access: {
    // See the note above before changing these.
    create: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  hooks: { beforeValidate: [assignTrailCity] },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'trail',
          type: 'relationship',
          relationTo: 'trails',
          required: true,
          index: true,
          admin: { width: '50%' },
        },
        {
          name: 'condition',
          type: 'relationship',
          relationTo: 'trail-condition-types',
          required: true,
          admin: { width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'observedAt',
          type: 'date',
          required: true,
          index: true,
          label: 'Observed',
          admin: {
            date: { pickerAppearance: 'dayOnly' },
            description: 'When it was ridden, not when this was typed.',
            width: '50%',
          },
        },
        {
          name: 'source',
          type: 'select',
          required: true,
          defaultValue: 'public',
          options: [
            { label: 'Rider report', value: 'public' },
            { label: 'Official', value: 'admin' },
          ],
          admin: {
            description: 'Official means the steward said so, not a rider.',
            width: '50%',
          },
        },
      ],
    },
    {
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      label: 'Hidden',
      index: true,
      admin: {
        description:
          'Takes this off the public map. The row stays, so repeat abuse is still visible here.',
      },
    },
    {
      name: 'city',
      type: 'select',
      required: true,
      options: cityOptions,
      index: true,
      admin: { readOnly: true, description: 'Taken from the selected trail.' },
    },
    {
      name: 'reporterHash',
      type: 'text',
      index: true,
      label: 'Reporter',
      admin: {
        description:
          'A one-way hash of the submitter’s IP, so repeat abuse can be found together. The address itself is never stored.',
        readOnly: true,
      },
    },
  ],
};
