/** A stored WGS84 bounding box in west, south, east, north order. */
export function parseGeographicBounds(
  value: unknown,
): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const [west, south, east, north] = value;
  return value.every(
    (coordinate) =>
      typeof coordinate === 'number' && Number.isFinite(coordinate),
  ) &&
    west >= -180 &&
    east <= 180 &&
    west <= east &&
    south >= -90 &&
    north <= 90 &&
    south <= north
    ? [west, south, east, north]
    : undefined;
}
