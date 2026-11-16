import { describe, expect, it } from 'vitest';
import { buildWalkableGrid, isWalkable } from '../src/shared/simulation/grid';
import { findPath } from '../src/ui/avatars/pathfinding';

const size = { cols: 6, rows: 5 };

describe('findPath', () => {
  it('walks in a straight line on an empty floor', () => {
    const grid = buildWalkableGrid(size, []);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 3, row: 0 })).toEqual([
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ]);
  });

  it('returns an empty path when already at the destination', () => {
    const grid = buildWalkableGrid(size, []);
    expect(findPath(grid, { col: 2, row: 2 }, { col: 2, row: 2 })).toEqual([]);
  });

  it('goes around furniture using only four-directional steps', () => {
    // A wall across the room with a single gap on the right.
    const grid = buildWalkableGrid(size, [{ col: 0, row: 2, width: 5, depth: 1 }]);
    const start = { col: 0, row: 0 };
    const path = findPath(grid, start, { col: 0, row: 4 });
    expect(path).not.toBeNull();

    let previous = start;
    for (const step of path ?? []) {
      expect(isWalkable(grid, step)).toBe(true);
      expect(Math.abs(step.col - previous.col) + Math.abs(step.row - previous.row)).toBe(1);
      previous = step;
    }
    expect(previous).toEqual({ col: 0, row: 4 });
    expect(path).toContainEqual({ col: 5, row: 2 });
  });

  it('returns null when the destination is blocked', () => {
    const grid = buildWalkableGrid(size, [{ col: 3, row: 3, width: 1, depth: 1 }]);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 3, row: 3 })).toBeNull();
  });

  it('returns null when the destination is walled off', () => {
    const grid = buildWalkableGrid(size, [{ col: 0, row: 2, width: 6, depth: 1 }]);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 0, row: 4 })).toBeNull();
  });
});
