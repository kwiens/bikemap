'use client';

/**
 * The two trail fields that fill themselves in from the trail name.
 *
 * `displayName` copies it verbatim; `slug` lowercases it and joins the words
 * with dashes. Both are the same component with a different transform — see
 * `use-derived-value.ts` for the rules about when it does and doesn't write.
 */
import type { TextFieldClientProps } from 'payload';
import { slugify } from '@/utils/string';
import { FieldShell, inputStyle, useFieldId } from './admin-ui';
import { useDerivedValue } from './use-derived-value';

/** The name shown in the sidebar and the pane. Defaults to the trail name. */
export function TrailDisplayNameField(props: TextFieldClientProps) {
  return (
    <DerivedTextField
      {...props}
      fallbackLabel="Display name"
      source="trailName"
    />
  );
}

/**
 * The trail's identifier. Defaults to the trail name, lowercased and dashed.
 *
 * Monospaced because it is a key rather than prose — it names the elevation
 * profile and appears in URLs.
 */
export function TrailSlugField(props: TextFieldClientProps) {
  return (
    <DerivedTextField
      {...props}
      fallbackLabel="Slug"
      mono
      source="trailName"
      transform={slugify}
    />
  );
}

function DerivedTextField({
  fallbackLabel,
  field,
  mono,
  path,
  readOnly,
  source,
  transform,
}: TextFieldClientProps & {
  fallbackLabel: string;
  mono?: boolean;
  source: string;
  transform?: (value: string) => string;
}) {
  const { derived, onBlur, onFocus, setValue, value } = useDerivedValue({
    path,
    readOnly,
    sourcePath: source,
    transform,
  });

  const label = typeof field?.label === 'string' ? field.label : fallbackLabel;
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
      <input
        className="field-type__wrap"
        disabled={readOnly}
        id={inputId}
        onBlur={onBlur}
        onChange={(event) => setValue(event.target.value)}
        onFocus={onFocus}
        placeholder={derived || undefined}
        spellCheck={!mono}
        style={inputStyle(mono)}
        type="text"
        value={value}
      />
    </FieldShell>
  );
}
