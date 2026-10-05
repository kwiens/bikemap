import type { Field, TextField } from 'payload';
import { describe, expect, it } from 'vitest';
import { Theme } from './Theme';

function textFields(fields: Field[]): TextField[] {
  return fields.flatMap((field) => {
    if ('fields' in field && Array.isArray(field.fields)) {
      return textFields(field.fields);
    }
    return field.type === 'text' ? [field] : [];
  });
}

describe('Theme global', () => {
  it('keeps the Ride Bend fallback palette and editor-facing labels together', () => {
    const fields = textFields(Theme.fields);

    expect(
      fields.map(({ defaultValue, label, name }) => ({
        defaultValue,
        label,
        name,
      })),
    ).toEqual([
      {
        defaultValue: '#c3f44d',
        label: 'Selected items & highlights',
        name: 'primaryColor',
      },
      {
        defaultValue: '#1a434e',
        label: 'Sidebar & map controls',
        name: 'sidebarColor',
      },
      {
        defaultValue: '#ffffff',
        label: 'Panels & backgrounds',
        name: 'surfaceColor',
      },
      {
        defaultValue: '#1a434e',
        label: 'Text & neutral shades',
        name: 'textColor',
      },
      {
        defaultValue: '#a5d730',
        label: 'Enabled controls',
        name: 'accentColor',
      },
    ]);
  });

  it('accepts only empty or six-digit hex values', () => {
    const [primary] = textFields(Theme.fields);
    const validate = primary.validate as (value: unknown) => string | true;

    expect(validate(undefined)).toBe(true);
    expect(validate('#c3f44d')).toBe(true);
    expect(validate('#fff')).toMatch(/6-digit hex/i);
    expect(validate('red')).toMatch(/6-digit hex/i);
  });
});
