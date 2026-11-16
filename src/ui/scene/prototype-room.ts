import type { GridSize } from '../../shared/simulation/grid';

/** Static description of a room. Later phases load this from the database. */
export interface RoomLayout {
  size: GridSize;
  wallHeight: number;
}

/** The single room of the Phase 0 prototype. */
export const PROTOTYPE_ROOM: RoomLayout = {
  size: { cols: 12, rows: 10 },
  wallHeight: 2.5,
};
