import type { CollectionConfig } from 'payload';
import { cityOptions } from '@/config/map.config';
import { attractionIconOptions } from '@/data/map-features';
import {
  accessAssignedCity,
  canChangeCity,
  createInAssignedCity,
} from '@/payload/access/city-scoped';

export const Attractions: CollectionConfig = {
  slug: 'attractions',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'address', '_status'],
    group: 'Map content',
    description:
      'Published attractions appear as pins and cards in the Attractions layer.',
    listSearchableFields: ['name', 'address'],
  },
  access: {
    create: createInAssignedCity,
    delete: accessAssignedCity,
    read: ({ req }) =>
      req.user
        ? accessAssignedCity({ req })
        : { _status: { equals: 'published' } },
    update: accessAssignedCity,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'city',
          type: 'select',
          required: true,
          index: true,
          options: cityOptions,
          access: { update: canChangeCity },
        },
      ],
    },
    { name: 'description', type: 'textarea', required: true },
    { name: 'address', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'latitude',
          type: 'number',
          required: true,
          min: -90,
          max: 90,
          admin: { step: 0.0000001 },
        },
        {
          name: 'longitude',
          type: 'number',
          required: true,
          min: -180,
          max: 180,
          admin: { step: 0.0000001 },
        },
      ],
    },
    {
      name: 'icon',
      type: 'select',
      required: true,
      defaultValue: 'pin',
      options: attractionIconOptions,
    },
  ],
};
