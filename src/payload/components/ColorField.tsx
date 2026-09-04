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
import { useField } from '@payloadcms/ui';
import type { TextFieldClientProps } from 'payload';
import { FieldShell, inputStyle, useFieldId } from './admin-ui';

const HEX = /^#[0-9a-f]{6}$/i;

/** The swatch needs a valid 6-digit hex; anything else shows as black. */
function swatchValue(value: string): string {
  return HEX.test(value) ? value : '#000000';
}

export function ColorField({ field, path }: TextFieldClientProps) {
  const { setValue, showError, value } = useField<string>({ path });
  const current = value ?? '';
  const label = typeof field?.label === 'string' ? field.label : path;

  // The label points at the hex box rather than the swatch: it is the field's
  // source of truth, and it is the one you can type into.
  const inputId = useFieldId(path);

  return (
    <FieldShell
      description={
        field?.admin?.description ? String(field.admin.description) : undefined
      }
      htmlFor={inputId}
      label={label}
      path={path}
      required={field?.required}
    >
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
          id={inputId}
          onChange={(event) => setValue(event.target.value)}
          placeholder="#c3f44d"
          spellCheck={false}
          style={{
            ...inputStyle(true),
            // Was `elevation-${showError ? '150' : '150'}` — both branches the
            // same, so an invalid colour never looked invalid.
            ...(showError
              ? { border: '1px solid var(--theme-error-500, #c00)' }
              : {}),
            flex: 1,
            width: undefined,
          }}
          type="text"
          value={current}
        />
      </div>
    </FieldShell>
  );
}
