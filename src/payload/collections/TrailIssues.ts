import type { CollectionConfig, FieldAccess } from 'payload';
import { cityOptions } from '@/config/map.config';
import { ISSUE_COMMENT_LIMIT, TRAIL_ISSUE_TYPES } from '@/data/trail-issues';
import { accessAssignedCity } from '@/payload/access/city-scoped';
import { readIssuePhoto } from '@/payload/issues/photo';

const immutable: FieldAccess = () => false;

export const TrailIssues: CollectionConfig = {
  slug: 'trail-issues',
  labels: { singular: 'Trail issue', plural: 'Trail issues' },
  admin: {
    group: 'Conditions',
    useAsTitle: 'trailName',
    defaultColumns: ['status', 'category', 'trail', 'city', 'createdAt'],
    description: 'Rider reports for stewards to review and resolve.',
  },
  defaultSort: '-createdAt',
  access: {
    // The public form writes through the validated map endpoint.
    create: () => false,
    read: accessAssignedCity,
    update: accessAssignedCity,
    delete: ({ req }) => req.user?.role === 'admin',
  },
  endpoints: [{ method: 'get', path: '/:id/photo', handler: readIssuePhoto }],
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      index: true,
      options: [
        { value: 'open', label: 'Open' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'dismissed', label: 'Dismissed' },
      ],
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      index: true,
      options: [...TRAIL_ISSUE_TYPES],
      access: { update: immutable },
      admin: { readOnly: true },
    },
    {
      name: 'trail',
      type: 'relationship',
      relationTo: 'trails',
      index: true,
      access: { update: immutable },
      admin: { readOnly: true },
    },
    {
      name: 'trailName',
      type: 'text',
      required: true,
      access: { update: immutable },
      admin: { readOnly: true },
    },
    {
      name: 'city',
      type: 'select',
      required: true,
      index: true,
      options: cityOptions,
      access: { update: immutable },
      admin: { readOnly: true },
    },
    {
      name: 'comment',
      type: 'textarea',
      maxLength: ISSUE_COMMENT_LIMIT,
      access: { update: immutable },
      admin: { readOnly: true },
    },
    {
      name: 'hasPhoto',
      type: 'checkbox',
      defaultValue: false,
      access: { update: immutable },
      admin: { hidden: true },
    },
    {
      name: 'photoPreview',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/components/TrailIssuePhoto#TrailIssuePhoto',
        },
      },
    },
    {
      name: 'reporterHash',
      type: 'text',
      index: true,
      required: true,
      access: { read: immutable, update: immutable },
      admin: { hidden: true },
    },
    {
      name: 'submissionId',
      type: 'text',
      unique: true,
      required: true,
      access: { read: immutable, update: immutable },
      admin: { hidden: true },
    },
  ],
};
