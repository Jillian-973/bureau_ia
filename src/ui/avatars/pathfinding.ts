import EasyStar from 'easystarjs';
import { WALKABLE, isWalkable } from '../../shared/simulation/grid';
import type { Cell, WalkableGrid } from '../../shared/simulation/grid';

/**
 * Finds the shortest walkable path between two cells with EasyStar (A*).
 * Movement is limited to the four directions, matching the avatar sprites.
 *
 * @returns the cells to walk through, excluding the starting cell (empty when
 * already there), or null when the destination cannot be reached.
 */
export function findPath(grid: WalkableGrid, from: Cell, to: Cell): Cell[] | null {
  if (!isWalkable(grid, to)) return null;

  const finder = new EasyStar.js();
  finder.setGrid(grid);
  finder.setAcceptableTiles([WALKABLE]);
  finder.enableSync();

  const outcome: { path: Cell[] | null } = { path: null };
  finder.findPath(from.col, from.row, to.col, to.row, (path: { x: number; y: number }[] | null) => {
    outcome.path = path ? path.slice(1).map((step) => ({ col: step.x, row: step.y })) : null;
  });
  finder.calculate();
  return outcome.path;
}
