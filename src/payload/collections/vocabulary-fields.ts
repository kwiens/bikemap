import type { Field, PayloadRequest } from 'payload';

/**
 * The bits `trail-ratings` and `trail-kinds` share.
 *
 * Both are small controlled vocabularies with the same shape — a human name, a
 * stable machine value, a colour — and the machine value is the part that has
 * to be got right in both. It is what the app matches on, so a stray capital or
 * a space in it means a trail that silently loses its colour.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;

export const slugValidator = {
  color(value: unknown): string | true {
    if (typeof value !== 'string' || !HEX.test(value)) {
      return 'Must be a 6-digit hex colour, e.g. #2563eb.';
    }
    return true;
  },
  value(value: unknown): string | true {
    if (typeof value !== 'string' || !SLUG.test(value)) {
      return 'Lowercase letters, numbers and dashes only — this is matched on in code, not shown to riders.';
    }
    return true;
  },
};

/**
 * The stable key a vocabulary row is matched on.
 *
 * Separate from `name` because the name is a label a curator may reword at any
 * time, while this is what the sidebar's shape lookup and the seed scripts key
 * off. Renaming "Intermediate" to "Blue" must not repaint the map.
 */
export function valueField(description: string): Field {
  return {
    name: 'value',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    admin: { description, width: '50%' },
    validate: slugValidator.value,
  };
}

/**
 * Preselects a vocabulary row on a new trail, by its stable value.
 *
 * A relationship can't carry a literal default the way a `select` could — the
 * default is a row id, which isn't knowable until the database has one. So it
 * is looked up, which is also why this is careful to fail quietly: a new-trail
 * form that 500s because a rating row was renamed would be a much worse outcome
 * than one that opens with the field blank for the curator to fill in.
 */
export function defaultVocabularyId(
  collection: 'trail-kinds' | 'trail-ratings',
  value: string,
) {
  return async ({
    req,
  }: {
    req?: PayloadRequest;
  }): Promise<number | undefined> => {
    if (!req?.payload) {
      return undefined;
    }
    try {
      const found = await req.payload.find({
        collection,
        depth: 0,
        limit: 1,
        pagination: false,
        where: { value: { equals: value } },
      });
      const id = found.docs[0]?.id;
      return typeof id === 'number' ? id : undefined;
    } catch {
      return undefined;
    }
  };
}
