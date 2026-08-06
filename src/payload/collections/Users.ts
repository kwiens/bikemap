import type { CollectionConfig } from 'payload';

/**
 * Admin accounts. Payload's own auth — `auth: true` adds the email/password
 * fields, login endpoints, and session handling.
 *
 * `city` scopes an editor to one city's content. ADR-0001 calls for city
 * scoping on day one rather than bolted on later; the access rules on Trails
 * read this field.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'city'],
  },
  access: {
    // Only admins manage accounts; editors can still read their own via /me.
    create: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin — all cities', value: 'admin' },
        { label: 'Editor — one city', value: 'editor' },
      ],
      access: {
        // An editor must not be able to promote themselves.
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
    {
      name: 'city',
      type: 'select',
      options: [
        { label: 'Chattanooga', value: 'chattanooga' },
        { label: 'Bend', value: 'bend' },
      ],
      admin: {
        description:
          'Which city this editor can change. Ignored for admins, who can edit every city.',
        condition: (data) => data?.role !== 'admin',
      },
      access: {
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
};
