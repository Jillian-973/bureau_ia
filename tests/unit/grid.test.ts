import { describe, expect, it } from 'vitest';
import {
  buildWalkableGrid,
  cellToWorld,
  footprintToWorld,
  isWalkable,
  worldToCell,
} from '../../src/shared/simulation/grid';

const size = { cols: 12, rows: 10 };

describe('grid', () => {
  it('places cell centres around the world origin', () => {
    expect(cellToWorld({ col: 0, row: 0 }, size)).toEqual({ x: -5.5, z: -4.5 });
    expect(cellToWorld({ col: 11, row: 9 }, size)).toEqual({ x: 5.5, z: 4.5 });
  });

  it('maps a world point back to its cell', () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 6, row: 5 },
      { col: 11, row: 9 },
    ]) {
      expect(worldToCell(cellToWorld(cell, size), size)).toEqual(cell);
    }
  });

  it('returns null for a point outside the room', () => {
    expect(worldToCell({ x: 6.2, z: 0 }, size)).toBeNull();
    expect(worldToCell({ x: 0, z: -5.1 }, size)).toBeNull();
  });

  it('centres a footprint between its cells', () => {
    expect(footprintToWorld({ col: 0, row: 0, width: 2, depth: 1 }, size)).toEqual({ x: -5, z: -4.5 });
  });

  it('blocks the cells covered by footprints and ignores overflow', () => {
    const grid = buildWalkableGrid(size, [
      { col: 2, row: 3, width: 2, depth: 1 },
      { col: 11, row: 9, width: 3, depth: 3 },
    ]);
    expect(isWalkable(grid, { col: 2, row: 3 })).toBe(false);
    expect(isWalkable(grid, { col: 3, row: 3 })).toBe(false);
    expect(isWalkable(grid, { col: 4, row: 3 })).toBe(true);
    expect(isWalkable(grid, { col: 11, row: 9 })).toBe(false);
    expect(isWalkable(grid, { col: 12, row: 9 })).toBe(false);
  });
});
