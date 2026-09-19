import type { CollectionConfig } from 'payload';

/**
 * Stewards — whoever looks after a trail. Volunteer clubs (COTA in Bend, SORBA
 * around Chattanooga) and the land managers whose ground the trail crosses
 * (Deschutes National Forest, parks departments) sit in the same list, because
 * from a trail's point of view they answer the same question.
 *
 * "Steward" rather than "organization" because it says what the relationship
 * *is*. It is also the word the trail world already uses — IMBA and the land
 * agencies both — and it covers a volunteer club and a national forest equally
 * well, where "builder" or "land manager" each only fit half the list.
 *
 * **Labels only.** The slug stays `organizations` and the field on a trail stays
 * `organization`, exactly as "trail complex" is an admin label over
 * `trail-areas`/`recArea`. Renaming the slug would mean a migration plus a sweep
 * through the seeds and the read path, for nothing a curator would notice.
 *
 * This exists as its own collection rather than a hardcoded `select` on Trails
 * so the options are editable in the admin without a deploy. Trails reference it
 * through a `relationship` field, which Payload renders as a searchable
 * dropdown and keeps referentially honest — renaming one here updates every
 * trail pointing at it, and Payload blocks deleting one that's still in use.
 */
export const Organizations: CollectionConfig = {
  slug: 'organizations',
  labels: {
    plural: 'Stewards',
    singular: 'Steward',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'abbreviation', 'url'],
    description:
      'The clubs and agencies that look after trails — volunteer groups and land managers alike. Anything added here becomes selectable on a trail.',
    group: 'Lists',
    listSearchableFields: ['name', 'abbreviation'],
  },
  access: {
    // Options are shared reference data, so any signed-in editor may read them,
    // but changing the list is an admin decision.
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
            description: 'Full name, e.g. "Central Oregon Trail Alliance".',
            width: '65%',
          },
        },
        {
          name: 'abbreviation',
          type: 'text',
          admin: {
            description: 'e.g. "COTA". Shown where space is tight.',
            width: '35%',
          },
        },
      ],
    },
    {
      name: 'city',
      type: 'select',
      options: [
        { label: 'Chattanooga', value: 'chattanooga' },
        { label: 'Bend', value: 'bend' },
      ],
      // Hidden: a deployment serves one city. Left blank an organization
      // applies everywhere, which is the right default here.
      admin: { hidden: true },
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'Where riders can find them — membership, trail reports.',
      },
      validate: (value: unknown): string | true => {
        if (!value) {
          return true;
        }
        try {
          const { protocol } = new URL(String(value));
          return protocol === 'http:' || protocol === 'https:'
            ? true
            : 'Must be an http or https URL.';
        } catch {
          return 'Must be a full URL, including https://';
        }
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'A sentence or two. Optional.',
      },
    },
  ],
};
