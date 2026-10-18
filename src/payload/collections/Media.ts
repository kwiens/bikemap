import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollectionConfig } from 'payload';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Images uploaded through Theme settings. */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Settings',
    hidden: true,
    useAsTitle: 'alt',
  },
  access: {
    create: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin',
  },
  upload: {
    staticDir: path.resolve(dirname, '../../../public/media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  fields: [
    {
      name: 'alt',
      label: 'Alternative text',
      type: 'text',
      required: true,
      admin: {
        description: 'A short description of the logo for screen readers.',
      },
    },
  ],
};
