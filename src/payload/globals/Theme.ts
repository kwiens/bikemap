import type { GlobalConfig } from 'payload';

/**
 * Admin appearance, editable at `/admin/globals/theme`.
 *
 * A global rather than a collection because there is exactly one of it. The
 * values become CSS custom properties injected by the admin layout — see
 * `src/payload/read/theme.ts` — so they ride on the same variables
 * `custom.css` sets, rather than fighting Payload's styles.
 *
 * Every field is optional. An unset field falls through to the stylesheet
 * default, so a half-filled theme is a valid theme and clearing a field is how
 * you reset it.
 */

/** Matches the swatch picker's output; also what the CSS variables expect. */
const HEX = /^#[0-9a-fA-F]{6}$/;

function validateHex(value: unknown): string | true {
  if (!value) {
    return true;
  }
  return HEX.test(String(value))
    ? true
    : 'Use a 6-digit hex colour, e.g. #c3f44d.';
}

export const Theme: GlobalConfig = {
  slug: 'theme',
  admin: {
    description:
      'How the admin looks. Changes apply on the next page load. Clear a field to fall back to the default.',
    group: 'Settings',
  },
  access: {
    // Appearance is global — one editor's change is everyone's, so it's an
    // admin decision. Reading is open because the layout renders it for
    // whoever is signed in.
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Colour',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'accentColor',
              type: 'text',
              admin: {
                components: {
                  Field: '@/payload/components/ColorField#ColorField',
                },
                description: 'Focus rings and highlights. Default #c3f44d.',
                width: '50%',
              },
              validate: validateHex,
            },
            {
              name: 'deepColor',
              type: 'text',
              admin: {
                components: {
                  Field: '@/payload/components/ColorField#ColorField',
                },
                description: 'Deep brand colour. Default #1a434e.',
                width: '50%',
              },
              validate: validateHex,
            },
          ],
        },
        {
          name: 'neutralTint',
          type: 'select',
          options: [
            { label: 'Cool — leans blue/teal (default)', value: 'cool' },
            { label: 'Neutral — pure grey', value: 'neutral' },
            { label: 'Warm — leans brown', value: 'warm' },
          ],
          admin: {
            description:
              'The cast of the greys everything is built from. Applies to both light and dark mode, because Payload derives dark mode by inverting the same scale.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Shape & type',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'cornerStyle',
              type: 'select',
              options: [
                { label: 'Sharp — Payload default', value: 'sharp' },
                { label: 'Soft (default here)', value: 'soft' },
                { label: 'Round', value: 'round' },
              ],
              admin: { width: '50%' },
            },
            {
              name: 'fontFamily',
              type: 'select',
              options: [
                { label: 'Geist — matches the map (default)', value: 'geist' },
                { label: 'System UI', value: 'system' },
                { label: 'Serif', value: 'serif' },
              ],
              admin: { width: '50%' },
            },
          ],
        },
      ],
    },
    {
      name: 'customCss',
      type: 'textarea',
      admin: {
        description:
          'Escape hatch for anything the fields above do not cover. Injected verbatim into the admin. Admins only — treat it as code.',
        rows: 6,
      },
    },
  ],
};
