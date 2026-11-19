export interface RangeBuffer<T> {
  cells: Record<string, T>;
  height: number;
  width: number;
  cut: boolean;
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function makeRangeBuffer<T>(
  source: Record<string, T>,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  cut = false,
): RangeBuffer<T> {
  const cells: Record<string, T> = {};
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const value = source[cellKey(row, col)];
      if (value !== undefined) {
        cells[cellKey(row - startRow, col - startCol)] = value;
      }
    }
  }
  return {
    cells,
    height: endRow - startRow + 1,
    width: endCol - startCol + 1,
    cut,
  };
}

export function pasteRangeBuffer<T>(
  target: Record<string, T>,
  buffer: RangeBuffer<T>,
  startRow: number,
  startCol: number,
): Record<string, T> {
  const result = { ...target };
  for (let row = 0; row < buffer.height; row += 1) {
    for (let col = 0; col < buffer.width; col += 1) {
      const value = buffer.cells[cellKey(row, col)];
      if (value !== undefined) result[cellKey(startRow + row, startCol + col)] = value;
    }
  }
  return result;
}

export function clearRange<T>(
  target: Record<string, T>,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): Record<string, T> {
  const result = { ...target };
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      delete result[cellKey(row, col)];
    }
  }
  return result;
}
