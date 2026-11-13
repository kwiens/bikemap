import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APIError, type CollectionConfig } from 'payload';
import { readLogoSvg, SVG_MIME_TYPE } from '@/utils/logo-svg';

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
      async function prepareUpload({ operation, req }) {
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
          const file = req.file;
          try {
            if (file.mimetype !== SVG_MIME_TYPE)
              throw new Error('Invalid type');
            readLogoSvg(
              file.tempFilePath ? await readFile(file.tempFilePath) : file.data,
            );
          } catch {
            throw new APIError(
              'Upload a static, self-contained SVG with a viewBox or pixel dimensions.',
              400,
              undefined,
              true,
            );
          }
          // A fresh filename lets replacements use immutable Blob URLs.
          file.name = `${randomUUID()}.svg`;
        }
      },
    ],
  },
  upload: {
    // The adapter also disables disk writes locally when a Blob token is set.
    disableLocalStorage: process.env.VERCEL === '1',
    staticDir: path.resolve(dirname, '../../../public/media'),
    mimeTypes: [SVG_MIME_TYPE],
    modifyResponseHeaders({ headers }) {
      if (headers.get('Content-Type')?.startsWith(SVG_MIME_TYPE)) {
        headers.set(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
        headers.set('X-Content-Type-Options', 'nosniff');
      }
      return headers;
    },
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
