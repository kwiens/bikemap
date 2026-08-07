'use client';

/**
 * Keeps a text field in step with another one until a curator takes it over.
 *
 * The rule for *when* is `shouldFollow` in `derived-value.ts` — read that
 * first; it is the part with the thinking in it, and the part that was once
 * wrong. This is the plumbing: read both fields, remember what we last wrote,
 * and stay out of the way while the input has focus.
 */
import { useEffect, useRef } from 'react';
import { useField } from '@payloadcms/ui';
import { shouldFollow } from './derived-value';

export interface DerivedValue {
  /** What the field follows — also shown as the placeholder. */
  derived: string;
  onBlur: () => void;
  onFocus: () => void;
  setValue: (value: string) => void;
  value: string;
}

export function useDerivedValue({
  path,
  readOnly,
  sourcePath,
  transform,
}: {
  path: string;
  readOnly?: boolean;
  /** The field to follow — `trailName` for both of today's uses. */
  sourcePath: string;
  /** Applied to the source value, and to whatever the curator types. */
  transform?: (value: string) => string;
}): DerivedValue {
  const { setValue, value } = useField<string>({ path });
  const { value: source } = useField<string>({ path: sourcePath });

  const current = value ?? '';
  const apply = transform ?? ((input: string) => input);
  const derived = source ? apply(source) : '';

  const focusedRef = useRef(false);
  const lastAppliedRef = useRef<null | string>(null);

  useEffect(() => {
    if (
      !shouldFollow({
        current,
        derived,
        focused: focusedRef.current,
        lastApplied: lastAppliedRef.current,
        readOnly,
      })
    ) {
      return;
    }
    lastAppliedRef.current = derived;
    setValue(derived);
  }, [current, derived, readOnly, setValue]);

  return {
    derived,
    onBlur: () => {
      focusedRef.current = false;
      if (!current && derived) {
        // Left empty, so hand it back rather than failing "required" on a field
        // nobody was asked to think about.
        lastAppliedRef.current = derived;
        setValue(derived);
      } else if (current) {
        // A slug is a key, so normalise whatever was typed.
        setValue(apply(current));
      }
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    setValue,
    value: current,
  };
}
