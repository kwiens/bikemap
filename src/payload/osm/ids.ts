/**
 * The largest OSM request the editor will send to the shared Overpass service.
 * A curated trail normally uses only a handful of ways; hundreds indicates a
 * bad paste or an accidental selection.
 */
export const MAX_WAYS_PER_REQUEST = 100;

export type ParsedOsmIds =
  | { ids: number[]; ok: true }
  | { error: string; ok: false };

/** Parses and validates the JSON field shape used by Payload and the editor. */
export function parseOsmIds(value: unknown): ParsedOsmIds {
  let raw = value;

  if (typeof raw === 'string') {
    if (!raw.trim()) {
      return { ids: [], ok: true };
    }
    try {
      raw = JSON.parse(raw);
    } catch {
      return {
        error: 'OSM ways must be a valid JSON list of way ids.',
        ok: false,
      };
    }
  }

  if (raw === null || raw === undefined) {
    return { ids: [], ok: true };
  }
  if (!Array.isArray(raw)) {
    return { error: 'OSM ways must be a list of way ids.', ok: false };
  }
  if (raw.length > MAX_WAYS_PER_REQUEST) {
    return {
      error: `A trail can reference at most ${MAX_WAYS_PER_REQUEST} OSM ways; this has ${raw.length}.`,
      ok: false,
    };
  }

  const ids: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'number' && typeof entry !== 'string') {
      return {
        error: `"${String(entry)}" is not an OSM way id. Ids are positive whole numbers.`,
        ok: false,
      };
    }
    const id = Number(entry);
    if (!Number.isInteger(id) || id <= 0) {
      return {
        error: `"${String(entry)}" is not an OSM way id. Ids are positive whole numbers.`,
        ok: false,
      };
    }
    ids.push(id);
  }

  if (new Set(ids).size !== ids.length) {
    return { error: 'The same OSM way is listed more than once.', ok: false };
  }

  return { ids, ok: true };
}

export function validateOsmIds(value: unknown): string | true {
  const parsed = parseOsmIds(value);
  return parsed.ok ? true : parsed.error;
}
