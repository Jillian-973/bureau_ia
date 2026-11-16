import type { Footprint, GridSize } from '../../shared/simulation/grid';

export type FurnitureKind =
  | 'desk'
  | 'chair'
  | 'bookshelf'
  | 'counter'
  | 'floor-lamp'
  | 'plant'
  | 'sofa'
  | 'rug';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  /** Cells covered on the floor, already in the final orientation. */
  footprint: Footprint;
  /** Number of quarter turns around the vertical axis. 0 faces the camera. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** Whether avatars must walk around the item. */
  blocking: boolean;
}

/** Static description of a room. Later phases load this from the database. */
export interface RoomLayout {
  size: GridSize;
  wallHeight: number;
  /** Windows of the back wall, given by the world X position of their centre. */
  windows: number[];
  furniture: FurnitureItem[];
}

const item = (
  id: string,
  kind: FurnitureKind,
  col: number,
  row: number,
  width: number,
  depth: number,
  options: { quarterTurns?: 0 | 1 | 2 | 3; blocking?: boolean } = {},
): FurnitureItem => ({
  id,
  kind,
  footprint: { col, row, width, depth },
  quarterTurns: options.quarterTurns ?? 0,
  blocking: options.blocking ?? true,
});

/** The single room of the Phase 0 prototype. Row 0 is against the back wall. */
export const PROTOTYPE_ROOM: RoomLayout = {
  size: { cols: 12, rows: 10 },
  wallHeight: 2.5,
  windows: [-3, 1],
  furniture: [
    item('lamp-corner', 'floor-lamp', 0, 0, 1, 1),
    item('bookshelf', 'bookshelf', 4, 0, 2, 1),
    item('counter', 'counter', 8, 0, 2, 1),
    item('plant-back', 'plant', 11, 0, 1, 1),
    item('desk-left', 'desk', 2, 2, 2, 1),
    item('chair-left', 'chair', 2, 3, 1, 1, { quarterTurns: 2 }),
    item('desk-right', 'desk', 7, 2, 2, 1),
    item('chair-right', 'chair', 8, 3, 1, 1, { quarterTurns: 2 }),
    item('sofa', 'sofa', 0, 5, 1, 2, { quarterTurns: 1 }),
    item('lamp-side', 'floor-lamp', 11, 6, 1, 1),
    item('plant-front', 'plant', 0, 8, 1, 1),
    item('rug', 'rug', 4, 5, 4, 3, { blocking: false }),
  ],
};

/** Footprints that avatars cannot walk through. */
export function getBlockingFootprints(layout: RoomLayout): Footprint[] {
  return layout.furniture.filter((entry) => entry.blocking).map((entry) => entry.footprint);
}
