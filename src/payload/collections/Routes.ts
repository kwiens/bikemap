import type { Access, CollectionConfig, FilterOptions } from 'payload';
import { cityOptions, isCityId } from '@/config/map.config';
import { resolveRouteSource } from '@/payload/hooks/resolveRouteSource';
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

const publishedTrailsForRouteCity: FilterOptions = ({ data }) =>
  isCityId(data.city)
    ? {
        and: [
          {
            city: { equals: data.city },
            _status: { equals: 'published' },
          },
        ],
      }
    : true;

/** Curated road and greenway routes whose rendered geometry Payload owns. */
export const Routes: CollectionConfig = {
  slug: 'routes',
  indexes: [{ fields: ['city', 'routeId'], unique: true }],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'kind', 'geometrySource', 'updatedAt'],
    description:
      'Every published Route appears in Casual mode. A Route may use imported geometry or reuse an existing Trail.',
    group: 'Map content',
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
  hooks: {
    beforeValidate: [resolveRouteSource],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          admin: {
            width: '50%',
            description:
              'Leave blank on a new trail-backed route to use the trail name.',
          },
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
          index: true,
          admin: {
            width: '25%',
            description:
              'Stable public identifier used by map selection and exports. Leave blank on a new trail-backed route to use the trail slug.',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'ride',
          options: [
            { label: 'Ride', value: 'ride' },
            { label: 'Greenway', value: 'greenway' },
            { label: 'Path', value: 'path' },
            { label: 'Trail', value: 'trail' },
          ],
          admin: {
            width: '25%',
            condition: (_, siblingData) =>
              siblingData.geometrySource !== 'trail',
          },
        },
        {
          name: 'geometrySource',
          type: 'select',
          required: true,
          defaultValue: 'imported',
          options: [
            { label: 'Imported geometry', value: 'imported' },
            { label: 'Existing trail', value: 'trail' },
          ],
          admin: {
            width: '25%',
            description:
              'An existing trail stays linked; edits to that trail automatically update this route.',
          },
        },
        {
          name: 'sourceTrail',
          type: 'relationship',
          relationTo: 'trails',
          filterOptions: publishedTrailsForRouteCity,
          admin: {
            width: '50%',
            condition: (_, siblingData) =>
              siblingData.geometrySource === 'trail',
            description:
              'Select a curated trail to expose it in the Casual routes tab.',
          },
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Short description shown under the route in Casual mode.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'color',
          type: 'text',
          required: true,
          defaultValue: '#2563EB',
          admin: { width: '25%' },
        },
        {
          name: 'defaultWidth',
          type: 'number',
          required: true,
          defaultValue: 8,
          min: 1,
          admin: { width: '25%' },
        },
        {
          name: 'opacity',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 0,
          max: 1,
          admin: { width: '25%' },
        },
        {
          name: 'distance',
          type: 'number',
          min: 0,
          admin: {
            width: '25%',
            condition: (_, siblingData) =>
              siblingData.geometrySource !== 'trail',
            description: 'Imported route distance in miles.',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'hideArrows',
          type: 'checkbox',
          defaultValue: false,
          admin: { width: '25%' },
        },
        {
          name: 'reverseDirection',
          type: 'checkbox',
          defaultValue: false,
          admin: { width: '25%' },
        },
        {
          name: 'bounds',
          type: 'json',
          admin: {
            width: '50%',
            readOnly: true,
            condition: (_, siblingData) =>
              siblingData.geometrySource !== 'trail',
            description: 'Imported [west, south, east, north] bounds.',
          },
        },
        {
          name: 'reverseArrowBounds',
          type: 'json',
          admin: {
            width: '50%',
            description:
              'Optional bounds where route arrows need their direction flipped.',
          },
        },
      ],
    },
    {
      name: 'geom',
      type: 'json',
      admin: {
        condition: (_, siblingData) => siblingData.geometrySource !== 'trail',
        description:
          'Normalized WGS84 route geometry. Import tooling owns this value.',
        readOnly: true,
      },
      validate: validateRouteGeometry,
    },
    {
      type: 'collapsible',
      label: 'Import provenance',
      admin: {
        initCollapsed: true,
        condition: (_, siblingData) => siblingData.geometrySource !== 'trail',
      },
      fields: [
        {
          name: 'sourcePath',
          type: 'text',
          admin: { readOnly: true },
        },
        {
          name: 'sourceSha256',
          type: 'text',
          admin: { readOnly: true },
        },
        {
          name: 'sourceFeatureCount',
          type: 'number',
          min: 1,
          admin: { readOnly: true },
        },
      ],
    },
  ],
};

export function validateRouteGeometry(
  value: unknown,
  options: { siblingData?: Record<string, unknown> } = {},
): string | true {
  if (options.siblingData?.geometrySource === 'trail') {
    return true;
  }
  const parsed = parseTrailGeometry(value);
  if (!parsed.ok) {
    return parsed.error;
  }
  return parsed.parts.length > 0
    ? true
    : 'Route geometry must contain at least one line.';
}
