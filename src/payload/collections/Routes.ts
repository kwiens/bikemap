import type { Access, CollectionConfig } from 'payload';
import { cityOptions } from '@/config/map.config';
import { parseTrailGeometry } from '@/payload/osm/geometry';

/** Admins edit every city; future scoped roles only edit their assigned city. */
const cityScoped: Access = ({ req }) => {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }
  return user.city ? { city: { equals: user.city } } : false;
};

/** Curated road and greenway routes whose rendered geometry Payload owns. */
export const Routes: CollectionConfig = {
  slug: 'routes',
  indexes: [{ fields: ['city', 'routeId'], unique: true }],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'routeId', 'updatedAt'],
    group: 'Routes',
    listSearchableFields: ['name', 'routeId'],
  },
  access: {
    create: cityScoped,
    delete: cityScoped,
    read: ({ req }) =>
      req.user ? cityScoped({ req }) : { _status: { equals: 'published' } },
    update: cityScoped,
  },
  versions: {
    drafts: true,
    maxPerDoc: 50,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          admin: { width: '50%' },
        },
        {
          name: 'city',
          type: 'select',
          required: true,
          options: cityOptions,
          admin: { width: '25%' },
        },
        {
          name: 'routeId',
          type: 'text',
          required: true,
          index: true,
          admin: {
            width: '25%',
            description:
              'Stable public identifier used by map selection and exports.',
          },
        },
      ],
    },
    {
      name: 'geom',
      type: 'json',
      required: true,
      admin: {
        description:
          'Normalized WGS84 route geometry. Import tooling owns this value.',
        readOnly: true,
      },
      validate: validateRouteGeometry,
    },
    {
      type: 'collapsible',
      label: 'Import provenance',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'sourcePath',
          type: 'text',
          required: true,
          admin: { readOnly: true },
        },
        {
          name: 'sourceSha256',
          type: 'text',
          required: true,
          admin: { readOnly: true },
        },
        {
          name: 'sourceFeatureCount',
          type: 'number',
          required: true,
          min: 1,
          admin: { readOnly: true },
        },
      ],
    },
  ],
};

export function validateRouteGeometry(value: unknown): string | true {
  const parsed = parseTrailGeometry(value);
  if (!parsed.ok) {
    return parsed.error;
  }
  return parsed.parts.length > 0
    ? true
    : 'Route geometry must contain at least one line.';
}
