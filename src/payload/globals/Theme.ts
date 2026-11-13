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
      placeholder: defaultValue,
      width,
    },
    validate: validateHex,
  };
}

export const Theme: GlobalConfig = {
  slug: 'theme',
  admin: {
    description:
      'Choose colors for the public map. Save and reload the map to see your changes. Clear a color to use its default.',
    group: 'Settings',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Public map colors',
      fields: [
        {
          type: 'row',
          fields: [
            colorField(
              'primaryColor',
              'Selected items & highlights',
              '#c3f44d',
              'Colors selected routes, trails, rides, and keyboard focus rings. Also colors selected tabs on Ride Bend.',
              '50%',
            ),
            colorField(
              'sidebarColor',
              'About page accents & Ride Bend controls',
              '#1a434e',
              'Colors headings and icon backgrounds on the About page, plus the menu and floating buttons on Ride Bend.',
              '50%',
            ),
          ],
        },
        {
          type: 'row',
          fields: [
            colorField(
              'surfaceColor',
              'Menu, buttons & page backgrounds',
              '#ffffff',
              'Colors page backgrounds, cards, and forms, plus the menu and floating buttons on Bike Chatt.',
              '33%',
            ),
            colorField(
              'textColor',
              'Text & icons',
              '#1a434e',
              'Colors text and Bike Chatt’s floating button icons. Also tints gray text, borders, and dividers.',
              '33%',
            ),
            colorField(
              'accentColor',
              'Enabled switches',
              '#a5d730',
              'Colors layer switches when they are on and floating buttons when hovered on Ride Bend.',
              '33%',
            ),
          ],
        },
      ],
    },
  ],
};
