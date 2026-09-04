import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';
import { Organizations } from './payload/collections/Organizations';
import { TrailAreas } from './payload/collections/TrailAreas';
import { TrailKinds } from './payload/collections/TrailKinds';
import { TrailRatings } from './payload/collections/TrailRatings';
import { Trails } from './payload/collections/Trails';
import { Users } from './payload/collections/Users';
import { Theme } from './payload/globals/Theme';

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
    components: {
      // Rendered above Payload's collection cards rather than replacing the
      // dashboard, so the default way of reaching a collection still works —
      // including if this ever fails to render.
      beforeDashboard: [
        '@/payload/components/DashboardSummary#DashboardSummary',
      ],
      // Above the collection groups: neither the dashboard nor the public map
      // is a collection, and Payload offers no way back to the dashboard but
      // the logo.
      beforeNavLinks: ['@/payload/components/AdminNavLinks#AdminNavLinks'],
    },
  },
  collections: [
    Trails,
    TrailAreas,
    TrailRatings,
    TrailKinds,
    Organizations,
    Users,
  ],
  globals: [Theme],
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
