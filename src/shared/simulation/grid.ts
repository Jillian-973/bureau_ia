/**
 * Floor grid of a room. One cell is one world unit; the room is centred on
 * the world origin, columns grow along +X and rows along +Z (towards the camera).
 */
export interface Cell {
  col: number;
  row: number;
}

export interface GridSize {
  cols: number;
  rows: number;
}

/** Rectangle of cells occupied by an object, anchored at its top-left cell. */
export interface Footprint {
  col: number;
  row: number;
  width: number;
  depth: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

/** Walkability map indexed as `grid[row][col]`. */
export type WalkableGrid = number[][];

export const CELL_SIZE = 1;
export const WALKABLE = 0;
export const BLOCKED = 1;

export function isInsideGrid(cell: Cell, size: GridSize): boolean {
  return cell.col >= 0 && cell.col < size.cols && cell.row >= 0 && cell.row < size.rows;
}

/** World position of the centre of a cell. */
export function cellToWorld(cell: Cell, size: GridSize): WorldPoint {
  return {
    x: (cell.col + 0.5 - size.cols / 2) * CELL_SIZE,
    z: (cell.row + 0.5 - size.rows / 2) * CELL_SIZE,
  };
}

/** Cell under a world position, or null when the point is outside the room. */
export function worldToCell(point: WorldPoint, size: GridSize): Cell | null {
  const cell = {
    col: Math.floor(point.x / CELL_SIZE + size.cols / 2),
    row: Math.floor(point.z / CELL_SIZE + size.rows / 2),
  };
  return isInsideGrid(cell, size) ? cell : null;
}

/** World position of the centre of a footprint. */
export function footprintToWorld(footprint: Footprint, size: GridSize): WorldPoint {
  return {
    x: (footprint.col + footprint.width / 2 - size.cols / 2) * CELL_SIZE,
    z: (footprint.row + footprint.depth / 2 - size.rows / 2) * CELL_SIZE,
  };
}

/** Builds the walkability map of a room from the footprints that block movement. */
export function buildWalkableGrid(size: GridSize, blocked: readonly Footprint[]): WalkableGrid {
  const grid: WalkableGrid = Array.from({ length: size.rows }, () =>
    new Array<number>(size.cols).fill(WALKABLE),
  );
  for (const footprint of blocked) {
    for (let row = footprint.row; row < footprint.row + footprint.depth; row++) {
      for (let col = footprint.col; col < footprint.col + footprint.width; col++) {
        const line = grid[row];
        if (line && col >= 0 && col < size.cols) line[col] = BLOCKED;
      }
    }
  }
  return grid;
}

export function isWalkable(grid: WalkableGrid, cell: Cell): boolean {
  return grid[cell.row]?.[cell.col] === WALKABLE;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}
