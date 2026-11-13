/** Grid arithmetic shared by the trail-tracing and road-routing networks. */
export function cellCoordinatesCovering(
  [west, south, east, north]: [number, number, number, number],
  cellSizeDegrees: number,
  maxCells = Number.POSITIVE_INFINITY,
): [number, number][] {
  const cells: [number, number][] = [];
  if (
    maxCells <= 0 ||
    !Number.isFinite(cellSizeDegrees) ||
    cellSizeDegrees <= 0 ||
    ![west, south, east, north].every(Number.isFinite) ||
    west >= 180 ||
    east < -180 ||
    south >= 90 ||
    north < -90
  )
    return cells;
  const minX = Math.floor(Math.max(-180, west) / cellSizeDegrees);
  const maxX = Math.min(
    Math.ceil(180 / cellSizeDegrees) - 1,
    Math.floor(east / cellSizeDegrees),
  );
  const minY = Math.floor(Math.max(-90, south) / cellSizeDegrees);
  const maxY = Math.min(
    Math.ceil(90 / cellSizeDegrees) - 1,
    Math.floor(north / cellSizeDegrees),
  );
  // Bounded by the number of cells in the box, or the caller's smaller cap.
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      cells.push([x, y]);
      if (cells.length >= maxCells) return cells;
    }
  }
  return cells;
}

export function boundsOfCell(
  x: number,
  y: number,
  cellSizeDegrees: number,
): [number, number, number, number] {
  // Stable decimal edges keep adjacent cells cacheable across both editors.
  return [x, y, x + 1, y + 1].map((coordinate) =>
    Number((coordinate * cellSizeDegrees).toFixed(10)),
  ) as [number, number, number, number];
}
