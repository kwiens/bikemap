'use client';

/**
 * A colour field: native swatch picker beside the hex value.
 *
 * Payload has no colour field type, and a bare text input asking for a hex code
 * is a poor way to choose a brand colour — you can't see it. `<input
 * type="color">` is built into every browser, needs no dependency, and is
 * keyboard accessible.
 *
 * The text input stays editable so a value can be pasted from a brand guide,
 * and it is the field's source of truth: the swatch only writes well-formed
 * hex back into it.
 */
import { useField, FieldLabel } from '@payloadcms/ui';
import type { TextFieldClientProps } from 'payload';

const HEX = /^#[0-9a-f]{6}$/i;

/** The swatch needs a valid 6-digit hex; anything else shows as black. */
function swatchValue(value: string): string {
  return HEX.test(value) ? value : '#000000';
}

export function ColorField({ field, path }: TextFieldClientProps) {
  const { setValue, showError, value } = useField<string>({ path });
  const current = value ?? '';
  const label = typeof field?.label === 'string' ? field.label : path;

  return (
    <div className="field-type text">
      <FieldLabel label={label} path={path} required={field?.required} />

      <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
        <input
          aria-label={`${label} colour picker`}
          onChange={(event) => setValue(event.target.value)}
          style={{
            background: 'none',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
            cursor: 'pointer',
            height: 38,
            padding: 2,
            width: 48,
          }}
          type="color"
          value={swatchValue(current)}
        />
        <input
          className="field-type__wrap"
          onChange={(event) => setValue(event.target.value)}
          placeholder="#c3f44d"
          spellCheck={false}
          style={{
            background: 'var(--theme-input-bg)',
            border: `1px solid var(--theme-elevation-${showError ? '150' : '150'})`,
            borderRadius: 'var(--style-radius-s)',
            color: 'var(--theme-text)',
            flex: 1,
            fontFamily: 'var(--font-mono)',
            padding: '0.5rem 0.75rem',
          }}
          type="text"
          value={current}
        />
      </div>

      {field?.admin?.description && (
        <div className="field-description">
          {String(field.admin.description)}
        </div>
      )}
    </div>
  );
}
