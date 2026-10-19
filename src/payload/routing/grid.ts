/** Grid arithmetic shared by the trail-tracing and road-routing networks. */
export function cellCoordinatesCovering(
  [west, south, east, north]: [number, number, number, number],
  cellSizeDegrees: number,
  maxCells = Number.POSITIVE_INFINITY,
): [number, number][] {
  const cells: [number, number][] = [];
  if (maxCells <= 0) return cells;
  // Bounded by the number of cells in the box, or the caller's smaller cap.
  for (
    let x = Math.floor(west / cellSizeDegrees);
    x <= Math.floor(east / cellSizeDegrees);
    x++
  ) {
    for (
      let y = Math.floor(south / cellSizeDegrees);
      y <= Math.floor(north / cellSizeDegrees);
      y++
    ) {
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
