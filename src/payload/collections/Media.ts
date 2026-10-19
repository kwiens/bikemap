import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APIError, type CollectionConfig } from 'payload';

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
  hooks: {
    beforeOperation: [
      function prepareUpload({ operation, req }) {
        if (
          (operation === 'create' || operation === 'update') &&
          process.env.VERCEL === '1' &&
          !process.env.BLOB_READ_WRITE_TOKEN
        ) {
          throw new APIError(
            'Logo storage is not configured.',
            503,
            undefined,
            true,
          );
        }
        if ((operation === 'create' || operation === 'update') && req.file) {
          // Replacements get a new URL so CDN caches cannot serve the old logo.
          req.file.name = `${randomUUID()}${path.extname(req.file.name)}`;
        }
      },
    ],
  },
  upload: {
    // The adapter also disables disk writes locally when a Blob token is set.
    disableLocalStorage: process.env.VERCEL === '1',
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
