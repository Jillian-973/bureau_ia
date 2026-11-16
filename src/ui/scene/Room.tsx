import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CELL_SIZE } from '../../shared/simulation/grid';
import { useDaylight } from './daylight-context';
import { createPlaceholderFloorTexture, createPlaceholderWallTexture } from './placeholder-textures';
import type { RoomLayout } from './prototype-room';

const WALL_THICKNESS = 0.25;
const SLAB_THICKNESS = 0.35;
/** Colour of the cut faces of the diorama (wall tops, slab sides). */
const CUT_COLOR = '#241d33';

const WINDOW_FRAME_COLOR = '#5f4330';

interface WindowProps {
  /** Centre of the window along the wall, and height of its sill. */
  x: number;
  sill: number;
  width: number;
  height: number;
  /** Position of the inner wall surface. */
  z: number;
}

/** Window on the back wall. Its glass glows with the colour of the sky outside. */
function Window({ x, sill, width, height, z }: WindowProps) {
  const daylight = useDaylight();
  const bar = 0.07;
  const frame: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [width + bar * 2, bar, 0.1], position: [0, height / 2 + bar / 2, 0] },
    { size: [width + bar * 2, bar, 0.14], position: [0, -height / 2 - bar / 2, 0.02] },
    { size: [bar, height, 0.1], position: [-width / 2 - bar / 2, 0, 0] },
    { size: [bar, height, 0.1], position: [width / 2 + bar / 2, 0, 0] },
    { size: [0.04, height, 0.06], position: [0, 0, 0] },
    { size: [width, 0.04, 0.06], position: [0, 0, 0] },
  ];
  return (
    <group position={[x, sill + height / 2, z]}>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color={daylight.windowColor}
          emissive={daylight.windowColor}
          emissiveIntensity={daylight.windowGlow}
          roughness={0.4}
        />
      </mesh>
      {frame.map((part, index) => (
        <mesh key={index} position={part.position} castShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial color={WINDOW_FRAME_COLOR} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

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

      {layout.windows.map((windowX) => (
        <Window key={windowX} x={windowX} sill={1.05} width={1.5} height={1.05} z={-depth / 2} />
      ))}

      {/* Side walls do not cast shadows: a low sun would otherwise darken the whole room. */}
      <mesh
        position={[-width / 2 - WALL_THICKNESS / 2, (height - SLAB_THICKNESS) / 2, 0]}
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, height + SLAB_THICKNESS, depth]} />
        {wallFaces(0, textures.sideWall)}
      </mesh>

      <mesh
        position={[width / 2 + WALL_THICKNESS / 2, (height - SLAB_THICKNESS) / 2, 0]}
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, height + SLAB_THICKNESS, depth]} />
        {wallFaces(1, textures.sideWall)}
      </mesh>
    </group>
  );
}
