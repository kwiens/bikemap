import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';
import { Trails } from './payload/collections/Trails';
import { Users } from './payload/collections/Users';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Geometry is stored as plain JSON, not a PostGIS column.
 *
 * A trail here doesn't own its geometry — it references OSM ways by id, and the
 * line is rebuilt from OSM on save (see src/payload/osm). The stored GeoJSON is
 * a derived cache, so the database never needs to query or edit it, and the
 * spatial types would buy nothing. See docs/adr/0001.
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Open Bike Map',
    },
  },
  collections: [Trails, Users],
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      ssl: process.env.DATABASE_SSL === 'disable' ? false : undefined,
    },
    // Schema changes go through committed migrations, not dev push.
    push: false,
  }),
});
