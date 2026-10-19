import type { GlobalConfig, TextField } from 'payload';

/** Site palette, editable at `/admin/globals/theme`. */

const HEX = /^#[0-9a-fA-F]{6}$/;

function validateHex(value: unknown): string | true {
  if (!value) return true;
  return HEX.test(String(value))
    ? true
    : 'Use a 6-digit hex colour, e.g. #c3f44d.';
}

function colorField(
  name: string,
  label: string,
  defaultValue: string,
  description: string,
  width: string,
): TextField {
  return {
    name,
    label,
    type: 'text',
    defaultValue,
    admin: {
      components: {
        Field: '@/payload/components/ColorField#ColorField',
      },
      description,
      width,
    },
    validate: validateHex,
  };
}

export const Theme: GlobalConfig = {
  slug: 'theme',
  admin: {
    description:
      'Customize the public map and admin palette. Each field explains which parts of the interface it changes. Changes apply on the next page load.',
    group: 'Settings',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Frontend color palette',
      fields: [
        {
          type: 'row',
          fields: [
            colorField(
              'primaryColor',
              'Selected items & highlights',
              '#c3f44d',
              'Changes selected tabs, highlighted cards, icons, borders, and keyboard focus rings.',
              '50%',
            ),
            colorField(
              'sidebarColor',
              'Sidebar & map controls',
              '#1a434e',
              'Changes the sidebar background, floating map buttons, and other dark brand areas.',
              '50%',
            ),
          ],
        },
        {
          type: 'row',
          fields: [
            colorField(
              'surfaceColor',
              'Panels & backgrounds',
              '#ffffff',
              'Changes cards, panels, form controls, and the light end of the neutral color scale.',
              '33%',
            ),
            colorField(
              'textColor',
              'Text & neutral shades',
              '#1a434e',
              'Changes primary text and tints the gray shades used for secondary text, borders, and dividers.',
              '33%',
            ),
            colorField(
              'accentColor',
              'Enabled controls',
              '#a5d730',
              'Changes enabled toggle switches, hover states, and supporting emphasis.',
              '33%',
            ),
          ],
        },
      ],
    },
  ],
};
