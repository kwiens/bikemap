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

/** Curated road, greenway, and trail routes shown in Casual mode. */
export const Routes: CollectionConfig = {
  slug: 'routes',
  indexes: [{ fields: ['city', 'routeId'], unique: true }],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'kind', 'geometrySource', 'updatedAt'],
    description:
      'Every published Route appears in Casual mode. Its geometry may come from an import, an existing Trail, or a current Mapbox Studio layer.',
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
            { label: 'Mapbox Studio layer', value: 'studio' },
          ],
          admin: {
            width: '25%',
            description:
              'Imported and Trail sources are database geometry. Studio is explicit for legacy routes that have not been migrated yet.',
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
            description: 'Route distance in miles.',
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
            description: '[west, south, east, north] bounds.',
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
        condition: (_, siblingData) =>
          siblingData.geometrySource === 'imported',
        description:
          'Normalized WGS84 route geometry. Import tooling owns this value when the source is Imported geometry.',
        readOnly: true,
      },
      validate: validateRouteGeometry,
    },
    {
      type: 'collapsible',
      label: 'Import provenance',
      admin: {
        initCollapsed: true,
        condition: (_, siblingData) =>
          siblingData.geometrySource === 'imported',
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
  const source = options.siblingData?.geometrySource ?? 'imported';
  if (source !== 'imported') {
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
