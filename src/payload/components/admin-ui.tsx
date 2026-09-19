'use client';

/**
 * The bits every custom admin field ended up re-inventing.
 *
 * Payload styles its own fields through a stylesheet we don't get to reach into
 * from a custom component, so each one here hand-rolled its own inputs and
 * notices. That was four separate spellings of the same coloured banner and two
 * of the same text input — which drift, and did: one banner used
 * `--theme-elevation-150` for its border where the others used a tone colour,
 * and the two inputs disagreed about focus.
 *
 * Everything is expressed in Payload's CSS variables, so all of it follows the
 * Theme global and dark mode without knowing about either. The `#hex` fallbacks
 * are for the handful of `--theme-warning-*` / `--theme-error-*` steps Payload
 * doesn't define in every release.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { FieldLabel } from '@payloadcms/ui';

export type Tone = 'error' | 'info' | 'warning';

const TONES: Record<Tone, { background: string; line: string }> = {
  error: {
    background: 'var(--theme-error-100, #fdeaea)',
    line: 'var(--theme-error-500, #c00)',
  },
  info: {
    background: 'var(--theme-elevation-50)',
    line: 'var(--theme-elevation-250, #cbd5d9)',
  },
  warning: {
    background: 'var(--theme-warning-100, #fff6e5)',
    line: 'var(--theme-warning-500, #e6a700)',
  },
};

/**
 * A short coloured notice — a validation error, a build warning, a caveat.
 *
 * The left rule rather than a full border because these stack directly above
 * the thing they are about, and a boxed notice reads as a separate section.
 */
export function Banner({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const { background, line } = TONES[tone];

  return (
    <p
      style={{
        background,
        borderLeft: `3px solid ${line}`,
        borderRadius: 'var(--style-radius-s)',
        margin: '0 0 0.5rem',
        padding: '0.5rem 0.75rem',
      }}
    >
      {children}
    </p>
  );
}

/**
 * An id that ties a label to its input.
 *
 * `FieldLabel` computes its own `htmlFor` from Payload internals when it isn't
 * given one, and when that comes back empty it silently renders a `<span>`
 * instead of a `<label>` — so clicking the label focused nothing and screen
 * readers had no label to announce. Owning both ends is the only way to be sure
 * they match. `useId` rather than a name-derived string so the same field
 * rendered twice (in a drawer, say) cannot collide.
 */
export function useFieldId(path: string): string {
  return `${path}-${useId()}`;
}

/** Payload's own field chrome: label above, description below. */
export function FieldShell({
  children,
  description,
  htmlFor,
  label,
  path,
  required,
}: {
  children: ReactNode;
  description?: ReactNode;
  htmlFor: string;
  label: string;
  path: string;
  required?: boolean;
}) {
  return (
    <div className="field-type text">
      <FieldLabel
        htmlFor={htmlFor}
        label={label}
        path={path}
        required={required}
      />
      {children}
      {description && <div className="field-description">{description}</div>}
    </div>
  );
}

/**
 * A text input that matches Payload's.
 *
 * `mono` is for values that are keys rather than prose — a slug, a hex colour —
 * where character-by-character reading is the point.
 */
export function inputStyle(mono = false): CSSProperties {
  return {
    background: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-text)',
    fontFamily: mono ? 'var(--font-mono)' : undefined,
    padding: '0.5rem 0.75rem',
    width: '100%',
  };
}

/**
 * A button that reads as a link — "remove", "discard edits".
 *
 * Inline actions inside a field, where a real button would carry more weight
 * than the action deserves.
 */
export function linkButtonStyle(
  tone: 'danger' | 'default' = 'default',
): CSSProperties {
  return {
    background: 'none',
    border: 'none',
    color:
      tone === 'danger'
        ? 'var(--theme-error-500, #c00)'
        : 'var(--theme-elevation-600)',
    cursor: 'pointer',
    font: 'inherit',
    padding: 0,
    textDecoration: 'underline',
  };
}
