import {
  APIError,
  type Access,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload';
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres';
import { cityOptions } from '@/config/map.config';

/** Admins may remove other accounts, but never the account in active use. */
export const canDeleteUser: Access = ({ id, req }) => {
  if (req.user?.role !== 'admin') {
    return false;
  }

  if (id !== undefined && String(id) === String(req.user.id)) {
    return false;
  }

  return { id: { not_equals: req.user.id } };
};

/** Defense in depth for internal calls that bypass collection access. */
export const preventDeletingLastAdmin: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  await lockAdministratorDeletion(req);

  const [user, { totalDocs }] = await Promise.all([
    req.payload.findByID({
      collection: 'users',
      id,
      overrideAccess: true,
      req,
    }),
    req.payload.count({
      collection: 'users',
      overrideAccess: true,
      req,
      where: { role: { equals: 'admin' } },
    }),
  ]);

  if (user.role === 'admin' && totalDocs <= 1) {
    throw new APIError(
      'The last administrator cannot be deleted. Create another administrator first.',
      409,
      null,
      true,
    );
  }
};

/**
 * Payload opens a transaction before collection delete hooks run. A
 * transaction-scoped advisory lock makes the following administrator count
 * and the eventual delete one serialized operation across every app instance.
 */
async function lockAdministratorDeletion(req: PayloadRequest): Promise<void> {
  const transactionID = await req.transactionID;
  const transaction = transactionID
    ? (req.payload.db as unknown as PostgresAdapter).sessions[
        String(transactionID)
      ]?.db
    : undefined;

  if (!transaction) {
    throw new Error('User deletion requires an active database transaction.');
  }

  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext('bikemap:administrator-deletion'))`,
  );
}

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
 * not bolted on later), and the shared city access rules read it. An admin edits
 * every city, so today it is always ignored and the field stays hidden.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    cookies: {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
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
    delete: canDeleteUser,
    update: ({ req }) => req.user?.role === 'admin',
  },
  hooks: {
    beforeDelete: [preventDeletingLastAdmin],
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
      options: cityOptions,
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
