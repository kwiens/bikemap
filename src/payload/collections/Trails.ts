import type {
  Access,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload';
import { resolveTrailGeometry } from '@/payload/hooks/resolveTrailGeometry';
import { activeCityId } from '@/config/map.config';
import { DEFAULT_KIND_VALUE, UNRATED_VALUE } from '@/data/trail-vocabulary';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { MAX_WAYS_PER_REQUEST } from '@/payload/osm/overpass';
import { slugify } from '@/utils/string';
import { conditionLockFields } from './condition-lock-fields';
import { defaultVocabularyId } from './vocabulary-fields';

/**
 * Mountain bike trails — the collection that currently lives as a ~3,200 line
 * array in src/data/mountain-bike-trails.data.ts.
 *
 * **By default a trail does not own its geometry.** It references the OSM ways
 * it rides on, and the line, distance, elevation, and bounds are rebuilt from
 * OSM on save by the `resolveTrailGeometry` hook. That is the path to prefer:
 * the geometry stays maintained upstream, where community fixes flow in for
 * free, and the derived numbers can't be edited into disagreeing with the line.
 *
 * When OSM is wrong or missing, the geometry editor lets a curator drag the
 * line into place. Doing so flips `geometrySource` to 'edited', which stops the
 * OSM rebuild for that trail — the line is then owned here, and only the
 * measurements are still derived. `distance` and the elevation fields stay
 * read-only either way; they are always computed from the line, never typed.
 *
 * The stored `geom` is plain JSON rather than a PostGIS column. See docs/adr/0001.
 */

/**
 * Admins edit every city; any other role only the city on its user record.
 *
 * Admin is the only role today, so in practice this is "signed in". The scoping
 * is here rather than deferred because it is the shape that has to hold when a
 * second role arrives — and a rule written then, against live data, is the kind
 * that gets one case wrong.
 */
const cityScoped: Access = ({ req }) => {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }
  // No city on a scoped user means no rows, rather than all rows.
  return user.city ? { city: { equals: user.city } } : false;
};

/**
 * Clears a trail's condition reports before the trail goes.
 *
 * `trail_conditions.trail_id` is NOT NULL with an ON DELETE SET NULL foreign key
 * — Payload generates that pair for a required relationship, and together they
 * make Postgres refuse the delete. Without this, deleting any trail someone had
 * reported on would fail with a raw constraint violation.
 */
const deleteConditionReports: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  await req.payload.delete({
    collection: 'trail-conditions',
    req,
    where: { trail: { equals: id } },
  });
};

export const Trails: CollectionConfig = {
  slug: 'trails',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'area', 'rating', 'distance'],
    group: 'Trails',
    listSearchableFields: ['displayName', 'trailName'],
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
    beforeChange: [resolveTrailGeometry],
    beforeDelete: [deleteConditionReports],
  },
  fields: [
    /**
     * Tabs, and specifically **unnamed** ones.
     *
     * A named tab nests everything under its key, in the document *and* in the
     * database — so naming these would rename every column, break the seeds and
     * the read path, and need a migration, all to move some boxes around on
     * screen. Unnamed tabs are pure layout: the fields stay exactly where they
     * were.
     *
     * `geometrySource` is deliberately not in here. It sits in the sidebar,
     * where it stays visible from every tab — it decides what the Geometry tab
     * will do on save, and reading it should not require going to look.
     */
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          description: 'What this trail is called and what it belongs to.',
          /**
           * Ordered by what a curator actually does, which is not the order the
           * fields were written in.
           *
           * `trailName` is the only name anyone types — `displayName` and `slug`
           * fill themselves in from it and are usually left exactly as they
           * land. Having them first meant the first two boxes on a new trail
           * were ones you were not supposed to touch, with the one that drives
           * them buried underneath.
           */
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'trailName',
                  type: 'text',
                  required: true,
                  index: true,
                  admin: {
                    width: '100%',
                    description:
                      'The name everything else follows from. It is also the raw `Trail` value from the Mapbox tileset and the join key to rendered features — so on an existing trail, change it only if the upstream GIS data changed.',
                  },
                },
                {
                  name: 'city',
                  type: 'select',
                  required: true,
                  defaultValue: activeCityId,
                  options: [
                    { label: 'Chattanooga', value: 'chattanooga' },
                    { label: 'Bend', value: 'bend' },
                  ],
                  admin: {
                    // Hidden because a deployment serves one city, so asking on every
                    // trail is noise. The column stays: getCityTrails filters on it,
                    // the seeds set it per city, and editor access is scoped by it.
                    // Drop `hidden` to bring the picker back for a multi-city admin.
                    hidden: true,
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'area',
                  type: 'relationship',
                  relationTo: 'trail-areas',
                  required: true,
                  label: 'Trail complex',
                  admin: {
                    width: '50%',
                    description:
                      'Manage the list under Lists → Trail complexes.',
                  },
                },
                {
                  name: 'organization',
                  type: 'relationship',
                  relationTo: 'organizations',
                  // Label only — the field name stays `organization`, as the
                  // collection slug stays `organizations`. See Organizations.ts.
                  label: 'Steward',
                  admin: {
                    width: '50%',
                    description:
                      'Who looks after this trail. Manage the list under Lists → Stewards.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'rating',
                  type: 'relationship',
                  relationTo: 'trail-ratings',
                  required: true,
                  defaultValue: defaultVocabularyId(
                    'trail-ratings',
                    UNRATED_VALUE,
                  ),
                  admin: {
                    width: '50%',
                    description: 'Manage the list under Lists → Trail ratings.',
                  },
                },
                {
                  name: 'kind',
                  type: 'relationship',
                  relationTo: 'trail-kinds',
                  required: true,
                  defaultValue: defaultVocabularyId(
                    'trail-kinds',
                    DEFAULT_KIND_VALUE,
                  ),
                  admin: {
                    width: '50%',
                    description:
                      'Drives the line colour and sidebar icon, both of which come from the kind and rating rows rather than being stored per trail. Manage the list under Lists → Trail kinds.',
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Condition reports',
              admin: {
                description:
                  'Log what this trail is like, and see what riders have said. Closing it below stops rider reports; the trail complex and Settings → Condition reporting can close it too, and any one is enough.',
                initCollapsed: true,
              },
              fields: [
                {
                  name: 'conditionLog',
                  type: 'ui',
                  label: 'Log a condition',
                  admin: {
                    components: {
                      Field:
                        '@/payload/components/TrailConditionLog#TrailConditionLog',
                    },
                  },
                },
                // Closing comes after logging: logging is the daily action, and
                // closing is the rare, deliberate one.
                ...conditionLockFields({
                  effect: 'for this trail',
                  example: 'Closed for logging until 1 May.',
                }),
              ],
            },
            {
              type: 'collapsible',
              // Deliberately general: this is where anything that looks after
              // itself goes, and the description carries the specifics so the
              // label survives the next field landing here.
              label: 'Advanced',
              admin: {
                description:
                  'Fields that fill themselves in and rarely need touching. The display name and slug both follow the trail name as you type it — open this only to override one.',
                // Collapsed because the common case is leaving them alone. The
                // document header shows `displayName` anyway (`useAsTitle`), so
                // collapsing it here does not hide what the trail is called.
                initCollapsed: true,
              },
              fields: [
                {
                  name: 'displayName',
                  type: 'text',
                  required: true,
                  admin: {
                    description:
                      'The name riders see in the sidebar and the elevation pane.',
                    components: {
                      Field:
                        '@/payload/components/DerivedTextField#TrailDisplayNameField',
                    },
                  },
                  hooks: { beforeValidate: [derivedFrom('trailName')] },
                },
                {
                  name: 'slug',
                  type: 'text',
                  required: true,
                  index: true,
                  admin: {
                    description:
                      'Identifies the trail in URLs and names its elevation profile. Changing it on an existing trail moves where that profile is looked up.',
                    components: {
                      Field:
                        '@/payload/components/DerivedTextField#TrailSlugField',
                    },
                  },
                  // Required because it is the key the elevation profile is looked up by:
                  // a trail saved without one had no chart, and nothing said why.
                  hooks: {
                    beforeValidate: [derivedFrom('trailName', slugify)],
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Geometry',
          description:
            'Where the trail runs. Pick the OSM ways it rides on, or adjust the line by hand.',
          fields: [
            // --- The authoring surface --------------------------------------------
            // One map, three modes: pick OSM ways, move the line's points, or draw it.
            // It is mounted on `geom` rather than `osmIds` because that is where the
            // hook's ValidationError lands, and an error has to render next to the map
            // that caused it. It writes to `osmIds` through `useField`.
            {
              name: 'geom',
              type: 'json',
              label: 'Trail geometry',
              admin: {
                components: {
                  Field: '@/payload/components/TrailMapEditor#TrailMapEditor',
                },
              },
              validate: validateGeometry,
            },
            {
              name: 'osmIds',
              type: 'json',
              // Not required: trails imported from a source other than OSM (today,
              // Chattanooga — its geometry lives in a Mapbox tileset and it has no way
              // ids) are legitimate rows. `geometrySource` records which kind this is.
              admin: {
                components: {
                  // No UI of its own — the map above authors this. See the component
                  // for why it isn't simply `admin.hidden`.
                  Field: '@/payload/components/OsmIdsStatus#OsmIdsStatus',
                },
              },
              validate: validateOsmIds,
            },
            {
              name: 'rebuildGeometry',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                condition: (data) => data?.geometrySource !== 'imported',
                description:
                  'Re-derive on the next save even if nothing changed. For an OSM trail that refetches the ways; for an edited one it just re-measures the line.',
              },
            },
          ],
        },
        {
          label: 'Measurements',
          description:
            'Measured from the line on every save. Read-only — a hand edit here would be overwritten by the next one.',
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
              name: 'elevationProfile',
              type: 'json',
              admin: {
                description:
                  'The per-point elevation chart, sampled on save. Trails in the checked-in data are served from public/data/elevation instead; this is what a trail created here draws from.',
                readOnly: true,
                // Hundreds of [distance, elevation, lng, lat] rows — nothing a
                // curator can act on, and it makes the form unreadable.
                hidden: true,
              },
            },
          ],
        },
      ],
    },

    // Sidebar, so it stays on screen whichever tab is open: it decides what the
    // Geometry tab will do on the next save, and checking that should not mean
    // navigating away from the map.
    {
      name: 'geometrySource',
      type: 'select',
      required: true,
      defaultValue: 'osm',
      options: [
        { label: 'Rebuilt from OSM ways', value: 'osm' },
        { label: 'Edited by hand', value: 'edited' },
        { label: 'Imported — not maintained here', value: 'imported' },
      ],
      admin: {
        description:
          'OSM trails rebuild their line from the picked ways on every save. Edited trails keep the line as drawn — the map sets this for you the first time you move a point. Imported trails are left alone entirely.',
        position: 'sidebar',
      },
    },
  ],
};

/**
 * Fills a blank field in from another one, server-side.
 *
 * The admin does this live as you type (`DerivedTextField`), which is where a
 * curator actually sees it happen. This is the same rule applied to every other
 * way a trail gets written — the REST API, the seed scripts, a migration — so
 * `required` can be relied on rather than being a trap for anything that isn't
 * the form.
 *
 * Field `beforeValidate` hooks run *before* `required` is checked, so filling
 * the value here satisfies it. (Note this is the field-level hook; collection
 * `beforeChange` hooks run before field validation, which is a different
 * ordering — see `resolveTrailGeometry`.)
 */
export function derivedFrom(
  source: 'trailName',
  transform: (value: string) => string = (value) => value,
) {
  return ({
    data,
    value,
  }: {
    data?: Record<string, unknown>;
    value?: unknown;
  }) => {
    if (typeof value === 'string' && value.trim()) {
      return transform(value);
    }
    const from = data?.[source];
    return typeof from === 'string' && from ? transform(from) : value;
  };
}

/**
 * Validates the line in the admin form, before a save is even attempted.
 *
 * `geom` stopped being write-once server output the moment the geometry editor
 * could write to it, and it arrives as untyped `jsonb`. A dropped minus sign on
 * a longitude puts a Bend trail in Kansas, and nothing downstream would notice.
 *
 * This is the *client-side* half of that check. Payload runs collection
 * `beforeChange` hooks before field validation, so on the server this function
 * only ever sees what `resolveTrailGeometry` returns — which is why the hook
 * does its own parse and throws a ValidationError rather than relying on this.
 */
function validateGeometry(value: unknown): string | true {
  return parseTrailGeometry(value).error ?? true;
}

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
