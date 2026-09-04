import type { CollectionConfig } from 'payload';

/**
 * Admin accounts. Payload's own auth — `auth: true` adds the email/password
 * fields, login endpoints, and session handling.
 *
 * **There is one role today: admin.** Everyone who can sign in can edit
 * everything. The `role` field stays anyway, and every access rule still asks
 * for `'admin'` explicitly rather than merely "is signed in", because that is
 * the difference between adding a second role later and *auditing* for one:
 * a new role lands with no permissions and is granted them deliberately, rather
 * than silently inheriting write access to every collection the moment it
 * exists. Failing closed is cheap now and expensive to retrofit.
 *
 * `city` is the other half of that, and is likewise kept rather than used: it
 * scopes a user to one city's content (ADR-0001 wants city scoping on day one,
 * not bolted on later), and `cityScoped` on Trails reads it. An admin edits
 * every city, so today it is always ignored and the field stays hidden.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'city'],
    description: 'Who can sign in and edit.',
    group: 'Settings',
  },
  access: {
    // Only admins manage accounts. Read is left to Payload's default, which
    // still lets anyone signed in fetch their own record via /me.
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
      defaultValue: 'admin',
      options: [{ label: 'Admin', value: 'admin' }],
      admin: {
        description:
          'One role for now. Adding another here is what turns the access rules across the collections into a real distinction.',
      },
      access: {
        // Nobody promotes themselves — the check that matters the moment a
        // second, lesser role exists.
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
          'Which city this user can change. Ignored for admins, who can edit every city.',
        // Always hidden while admin is the only role. It comes back on its own
        // when a role that isn't admin exists.
        condition: (data) => data?.role !== 'admin',
      },
      access: {
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
};
