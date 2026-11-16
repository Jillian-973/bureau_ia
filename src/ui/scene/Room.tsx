import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CELL_SIZE } from '../../shared/simulation/grid';
import { createPlaceholderFloorTexture, createPlaceholderWallTexture } from './placeholder-textures';
import type { RoomLayout } from './prototype-room';

const WALL_THICKNESS = 0.25;
const SLAB_THICKNESS = 0.35;
/** Colour of the cut faces of the diorama (wall tops, slab sides). */
const CUT_COLOR = '#241d33';

interface RoomProps {
  layout: RoomLayout;
  onFloorClick?: (event: ThreeEvent<MouseEvent>) => void;
}

/** Floor slab and the three walls of a room, open towards the camera. */
export function Room({ layout, onFloorClick }: RoomProps) {
  const width = layout.size.cols * CELL_SIZE;
  const depth = layout.size.rows * CELL_SIZE;
  const height = layout.wallHeight;

  const textures = useMemo(
    () => ({
      floor: createPlaceholderFloorTexture(layout.size.cols, layout.size.rows),
      backWall: createPlaceholderWallTexture(width, height),
      sideWall: createPlaceholderWallTexture(depth, height),
    }),
    [layout.size.cols, layout.size.rows, width, depth, height],
  );
  useEffect(
    () => () => {
      for (const texture of Object.values(textures)) texture.dispose();
    },
    [textures],
  );

  // Box faces are ordered +X, -X, +Y, -Y, +Z, -Z. Only the face turned towards
  // the inside of the room gets the wall texture.
  const wallFaces = (texturedFace: number, map: typeof textures.backWall) =>
    [0, 1, 2, 3, 4, 5].map((face) =>
      face === texturedFace ? (
        <meshStandardMaterial key={face} attach={`material-${face}`} map={map} roughness={0.95} />
      ) : (
        <meshStandardMaterial key={face} attach={`material-${face}`} color={CUT_COLOR} roughness={1} />
      ),
    );

  return (
    <group>
      {/* Floor slab: textured top, plain cut sides */}
      <mesh position={[0, -SLAB_THICKNESS / 2, 0]} receiveShadow onClick={onFloorClick}>
        <boxGeometry args={[width, SLAB_THICKNESS, depth]} />
        {[0, 1, 2, 3, 4, 5].map((face) =>
          face === 2 ? (
            <meshStandardMaterial key={face} attach={`material-${face}`} map={textures.floor} roughness={0.9} />
          ) : (
            <meshStandardMaterial key={face} attach={`material-${face}`} color={CUT_COLOR} roughness={1} />
          ),
        )}
      </mesh>

      {/* Back wall */}
      <mesh
        position={[0, (height - SLAB_THICKNESS) / 2, -depth / 2 - WALL_THICKNESS / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width + WALL_THICKNESS * 2, height + SLAB_THICKNESS, WALL_THICKNESS]} />
        {wallFaces(4, textures.backWall)}
      </mesh>

      {/* Left wall */}
      <mesh
        position={[-width / 2 - WALL_THICKNESS / 2, (height - SLAB_THICKNESS) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, height + SLAB_THICKNESS, depth]} />
        {wallFaces(0, textures.sideWall)}
      </mesh>

      {/* Right wall */}
      <mesh
        position={[width / 2 + WALL_THICKNESS / 2, (height - SLAB_THICKNESS) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, height + SLAB_THICKNESS, depth]} />
        {wallFaces(1, textures.sideWall)}
      </mesh>
    </group>
  );
}
