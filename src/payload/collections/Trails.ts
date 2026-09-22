import type { CollectionConfig, Field, FilterOptions } from 'payload';
import { resolveTrailGeometry } from '@/payload/hooks/resolveTrailGeometry';
import { cityOptions, isCityId } from '@/config/map.config';
import { DEFAULT_KIND_VALUE, UNRATED_VALUE } from '@/data/trail-vocabulary';
import {
  accessAssignedCity,
  canChangeCity,
  createInAssignedCity,
} from '@/payload/access/city-scoped';
import { recalculateTrailElevation } from '@/payload/endpoints/recalculate-trail-elevation';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { validateOsmIds } from '@/payload/osm/ids';
import { slugify } from '@/utils/string';
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

const areasForTrailCity: FilterOptions = ({ data }) =>
  isCityId(data.city) ? { city: { equals: data.city } } : true;

const stewardsForTrailCity: FilterOptions = ({ data }) =>
  isCityId(data.city)
    ? {
        or: [{ city: { equals: data.city } }, { city: { exists: false } }],
      }
    : true;

export const Trails: CollectionConfig = {
  slug: 'trails',
  indexes: [
    { fields: ['city', 'trailName'], unique: true },
    { fields: ['city', 'slug'], unique: true },
  ],
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'city', 'area', 'rating', 'distance'],
    group: 'Map content',
    listSearchableFields: ['displayName', 'trailName'],
  },
  // Published trails are public; everything else needs a login.
  access: {
    create: createInAssignedCity,
    delete: accessAssignedCity,
    read: ({ req }) =>
      req.user
        ? accessAssignedCity({ req })
        : { _status: { equals: 'published' } },
    update: accessAssignedCity,
  },
  versions: {
    drafts: true,
    // Revisions replace what we get free from GitHub PRs today (ADR-0001 C5).
    maxPerDoc: 50,
  },
  hooks: {
    beforeChange: [resolveTrailGeometry],
  },
  endpoints: [
    {
      handler: recalculateTrailElevation,
      method: 'post',
      path: '/:id/recalculate-elevation',
    },
  ],
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
     * where it stays visible from every tab — it decides what the Trail line
     * tab will do on save, and reading it should not require going to look.
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
                    width: '70%',
                    description:
                      'The name everything else follows from. It is also the raw `Trail` value from the source GIS and the join key to rendered features — so on an existing trail, change it only if the upstream data changed.',
                  },
                },
                {
                  name: 'city',
                  type: 'select',
                  required: true,
                  options: cityOptions,
                  access: {
                    update: canChangeCity,
                  },
                  admin: {
                    description:
                      'Which public city map serves this trail. The admin and database are shared across every city.',
                    width: '30%',
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
                  filterOptions: areasForTrailCity,
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
                  filterOptions: stewardsForTrailCity,
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
          label: 'Trail line',
          description:
            'Choose where the trail appears on the map. Use OpenStreetMap, adjust an existing line, or draw one here.',
          fields: [
            // --- The authoring surface --------------------------------------------
            // One map, three modes: pick OSM ways, move the line's points, or draw it.
            // It is mounted on `geom` rather than `osmIds` because that is where the
            // hook's ValidationError lands, and an error has to render next to the map
            // that caused it. It writes to `osmIds` through `useField`.
            {
              name: 'geom',
              type: 'json',
              label: 'Trail line',
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
              // Not required: trails imported from a source other than OSM
              // (today, Chattanooga's permitted GIS snapshot) are legitimate
              // rows. `geometrySource` records which kind this is.
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
              label: 'Refresh the saved trail line on the next save',
              defaultValue: false,
              admin: {
                condition: (data) => data?.geometrySource !== 'imported',
                description:
                  'Use this if the line or its measurements look out of date. OpenStreetMap lines are fetched again; drawn lines are measured again.',
              },
            },
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
          ],
        },
      ],
    },

    // These values stay in form state for the public map and elevation action,
    // but the chart below is their one curator-facing surface. Showing raw
    // read-only numbers in a third tab made them look independently editable.
    derivedMeasurement('distance'),
    derivedMeasurement('elevationGain'),
    derivedMeasurement('elevationLoss'),
    derivedMeasurement('elevationMin'),
    derivedMeasurement('elevationMax'),
    {
      name: 'bounds',
      type: 'json',
      admin: {
        components: {
          Field:
            '@/payload/components/ElevationProfileAdmin#DerivedMeasurementField',
        },
        description: '[swLng, swLat, neLng, neLat], for zoom-to-fit.',
        readOnly: true,
      },
    },
    {
      name: 'elevationProfile',
      type: 'json',
      admin: {
        description:
          'The per-point elevation chart, imported with seeded geometry or sampled whenever geometry is rebuilt or edited.',
        readOnly: true,
        // Hundreds of [distance, elevation, lng, lat] rows — nothing a
        // curator can act on, and it makes the form unreadable.
        hidden: true,
      },
    },

    // Keep the chart and its refresh action visible beneath every tab. The
    // elevation endpoint saves independently, so hiding this in Measurements
    // made the result—and the fact that it was already persisted—easy to miss.
    {
      name: 'elevationProfileAdmin',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@/payload/components/ElevationProfileAdmin#ElevationProfileAdmin',
        },
      },
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
        components: {
          Field: '@/payload/components/GeometrySourceField#GeometrySourceField',
        },
        position: 'sidebar',
      },
    },
  ],
};

/** Stored in the form and available to list columns, rendered by the chart. */
function derivedMeasurement(
  name:
    | 'distance'
    | 'elevationGain'
    | 'elevationLoss'
    | 'elevationMax'
    | 'elevationMin',
): Field {
  return {
    name,
    type: 'number',
    admin: {
      components: {
        Field:
          '@/payload/components/ElevationProfileAdmin#DerivedMeasurementField',
      },
      description:
        name === 'distance'
          ? 'Miles, measured from the saved geometry.'
          : 'Feet, sampled from Mapbox Terrain-RGB.',
      readOnly: true,
    },
  };
}

export interface DerivedFromArgs {
  data?: Record<string, unknown>;
  /** Which field the hook is mounted on, to read it out of `originalDoc`. */
  field?: { name?: string };
  operation?: 'create' | 'delete' | 'read' | 'update';
  originalDoc?: Record<string, unknown>;
  /** Payload's per-field copy of what the stored document holds. */
  previousValue?: unknown;
  value?: unknown;
}

/**
 * Fills a blank field in from another one, server-side.
 *
 * The admin does this live as you type (`DerivedTextField`), which is where a
 * curator actually sees it happen. This is the same rule applied to every other
 * way a trail gets written — the REST API, the seed scripts, a migration — so
 * `required` can be relied on rather than being a trap for anything that isn't
 * the form.
 *
 * **Deriving is for new and blank values only. A value already in the document
 * is never rewritten** — the same rule `shouldFollow` holds to in
 * components/derived-value.ts, and for the same reason: display names are
 * routinely different from the raw tileset `trailName`, and `slug` keys the
 * elevation profile lookup and the share URL, so re-deriving one on an
 * unrelated save moves a chart out from under a trail. So an update that simply
 * doesn't mention the field — a partial API write that sets `trailName` and
 * nothing else — leaves it alone. Blanking it *on purpose* still re-derives:
 * clearing the field is how you ask for the default back.
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
  return (args: DerivedFromArgs): unknown => {
    const { data, operation, value } = args;
    const stored = storedValue(args);

    // Untouched on an update: absent from the request, or handed back exactly
    // as stored (Payload fills an absent field in from the document before the
    // hooks run, so both arrive here looking the same). Returned verbatim
    // rather than transformed — a stored slug that predates the rule is still
    // the key something is filed under.
    if (
      operation === 'update' &&
      stored &&
      (value === undefined || value === stored)
    ) {
      return stored;
    }

    if (typeof value === 'string' && value.trim()) {
      return transform(value);
    }

    const from = data?.[source];
    return typeof from === 'string' && from ? transform(from) : value;
  };
}

/**
 * What the stored document holds for this field, if anything.
 *
 * `previousValue` is Payload's per-field copy of it; `originalDoc` plus the
 * field name is the same thing read the long way, for callers that pass the
 * document rather than the field.
 */
function storedValue({
  field,
  originalDoc,
  previousValue,
}: DerivedFromArgs): string | undefined {
  if (typeof previousValue === 'string') {
    return previousValue || undefined;
  }
  const fromDoc = field?.name ? originalDoc?.[field.name] : undefined;
  return typeof fromDoc === 'string' && fromDoc ? fromDoc : undefined;
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
