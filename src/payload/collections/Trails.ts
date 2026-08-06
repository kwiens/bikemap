import type { Access, CollectionConfig } from 'payload';
import { resolveOsmGeometry } from '@/payload/hooks/resolveOsmGeometry';
import { MAX_WAYS_PER_REQUEST } from '@/payload/osm/overpass';

/**
 * Mountain bike trails — the collection that currently lives as a ~3,200 line
 * array in src/data/mountain-bike-trails.data.ts.
 *
 * **A trail does not own its geometry.** It references the OSM ways it rides
 * on, and everything geometric — the line, distance, elevation, bounds — is
 * rebuilt from OSM on save by the `resolveOsmGeometry` hook. Those fields are
 * read-only in the admin on purpose: editing them by hand would just be
 * overwritten on the next save, and the point of referencing OSM is that
 * community fixes flow in for free.
 *
 * The stored `geom` is therefore a cache, not a source of truth, which is why
 * it's plain JSON rather than a PostGIS column. See docs/adr/0001.
 */

/** Admins edit every city; editors only the city on their user record. */
const cityScoped: Access = ({ req }) => {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }
  // No city on an editor means no rows, rather than all rows.
  return user.city ? { city: { equals: user.city } } : false;
};

export const Trails: CollectionConfig = {
  slug: 'trails',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'recArea', 'rating', 'distance', 'city'],
    group: 'Map content',
    listSearchableFields: ['displayName', 'trailName', 'recArea'],
  },
  // Published trails are public; everything else needs a login.
  access: {
    create: cityScoped,
    delete: cityScoped,
    read: ({ req }) =>
      req.user ? cityScoped({ req }) : { _status: { equals: 'published' } },
    update: cityScoped,
  },
  versions: {
    drafts: true,
    // Revisions replace what we get free from GitHub PRs today (ADR-0001 C5).
    maxPerDoc: 50,
  },
  hooks: {
    beforeChange: [resolveOsmGeometry],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'displayName',
          type: 'text',
          required: true,
          admin: {
            width: '50%',
            description: 'Human-friendly name shown in the sidebar and pane.',
          },
        },
        {
          name: 'city',
          type: 'select',
          required: true,
          options: [
            { label: 'Chattanooga', value: 'chattanooga' },
            { label: 'Bend', value: 'bend' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'trailName',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'The raw `Trail` property value from the Mapbox tileset. This is the join key to rendered features — change it only if the upstream GIS data changed.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: {
        description:
          'Canonical slug when it differs from the trail name. Also names the elevation profile JSON.',
      },
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      admin: {
        description:
          'Who builds and maintains this trail. Manage the list under Map content → Organizations.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'recArea',
          type: 'text',
          required: true,
          index: true,
          admin: {
            width: '50%',
            description: 'Recreation area grouping, e.g. "Stringers Ridge".',
          },
        },
        {
          name: 'rating',
          type: 'select',
          required: true,
          defaultValue: 'unrated',
          options: [
            { label: 'Easy', value: 'easy' },
            { label: 'Intermediate', value: 'intermediate' },
            { label: 'Advanced', value: 'advanced' },
            { label: 'Expert', value: 'expert' },
            { label: 'Unrated', value: 'unrated' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'trail',
      options: [
        { label: 'Singletrack trail', value: 'trail' },
        { label: 'Greenway', value: 'greenway' },
      ],
      admin: {
        description:
          'Drives the line color and marker icon. Colors are derived from kind + rating rather than stored, so a palette change is one code edit.',
      },
    },
    // --- The authored geometry input -------------------------------------
    {
      name: 'osmIds',
      type: 'json',
      // Not required: trails imported from a source other than OSM (today,
      // Chattanooga — its geometry lives in a Mapbox tileset and it has no way
      // ids) are legitimate rows. `geometrySource` records which kind this is.
      admin: {
        components: {
          Field: '@/payload/components/OsmWayPicker#OsmWayPicker',
        },
        description:
          'The OSM ways this trail rides on. Pick them on the map — everything below is rebuilt from them when you save.',
      },
      validate: validateOsmIds,
    },
    {
      name: 'geometrySource',
      type: 'select',
      required: true,
      defaultValue: 'osm',
      options: [
        { label: 'Rebuilt from OSM ways', value: 'osm' },
        { label: 'Imported — not maintained here', value: 'imported' },
      ],
      admin: {
        description:
          'Imported trails keep whatever geometry and measurements came with them; the OSM rebuild leaves them alone. Set this to OSM once the trail has been matched to way ids.',
        position: 'sidebar',
      },
    },
    {
      name: 'rebuildGeometry',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Rebuild from OSM on the next save even if the ways have not changed. Use after a trail has been rerouted or fixed upstream.',
      },
    },

    // --- Everything below is derived on save -------------------------------
    {
      type: 'collapsible',
      label: 'Derived from OSM',
      admin: {
        description:
          'Rebuilt from the ways above every time they change. Read-only — hand edits would be overwritten on the next save.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'osmReport',
          type: 'json',
          admin: {
            components: {
              Field: '@/payload/components/OsmBuildReport#OsmBuildReport',
            },
            readOnly: true,
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'distance',
              type: 'number',
              admin: {
                description: 'Miles, measured from the OSM geometry.',
                readOnly: true,
                width: '50%',
              },
            },
            {
              name: 'elevationGain',
              type: 'number',
              admin: {
                description: 'Feet, sampled from Mapbox Terrain-RGB.',
                readOnly: true,
                width: '50%',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'elevationLoss',
              type: 'number',
              admin: { readOnly: true, width: '33%' },
            },
            {
              name: 'elevationMin',
              type: 'number',
              admin: { readOnly: true, width: '33%' },
            },
            {
              name: 'elevationMax',
              type: 'number',
              admin: { readOnly: true, width: '33%' },
            },
          ],
        },
        {
          name: 'bounds',
          type: 'json',
          admin: {
            description: '[swLng, swLat, neLng, neLat], for zoom-to-fit.',
            readOnly: true,
          },
        },
        {
          name: 'geom',
          type: 'json',
          admin: {
            description:
              'GeoJSON MultiLineString (EPSG:4326) assembled from the OSM ways. A cache of what OSM says, not a source of truth.',
            readOnly: true,
          },
        },
      ],
    },
  ],
};

/**
 * Validates the way-id list before a save triggers an Overpass request.
 *
 * Catching a bad paste here means the editor sees a field error instead of the
 * build hook firing a doomed request at a shared community endpoint.
 */
function validateOsmIds(value: unknown): string | true {
  const raw = typeof value === 'string' ? tryParse(value) : value;

  // Empty is allowed — an imported trail has no way ids yet. The rebuild hook
  // simply has nothing to do until some are picked.
  if (raw === null || raw === undefined) {
    return true;
  }
  if (!Array.isArray(raw)) {
    return 'OSM ways must be a list of way ids.';
  }
  if (raw.length === 0) {
    return true;
  }
  if (raw.length > MAX_WAYS_PER_REQUEST) {
    return `A trail can reference at most ${MAX_WAYS_PER_REQUEST} OSM ways; this has ${raw.length}.`;
  }

  for (const entry of raw) {
    const id = Number(entry);
    if (!Number.isInteger(id) || id <= 0) {
      return `"${String(entry)}" is not an OSM way id. Ids are positive whole numbers.`;
    }
  }

  if (new Set(raw.map(Number)).size !== raw.length) {
    return 'The same OSM way is listed more than once.';
  }

  return true;
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
