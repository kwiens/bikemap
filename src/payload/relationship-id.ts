/** Payload returns the same relationship as an id or a populated document. */
export function readRelationshipId(value: unknown): number | string | null {
  const id =
    value && typeof value === 'object' && 'id' in value ? value.id : value;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}
