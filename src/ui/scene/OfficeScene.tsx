import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';
import { buildWalkableGrid, isWalkable, worldToCell } from '../../shared/simulation/grid';
import { Avatar } from '../avatars/Avatar';
import type { WalkRequest } from '../avatars/Avatar';
import { CameraRig } from './CameraRig';
import { CAMERA_FOV } from './camera-fit';
import { PlaceholderFurniture } from './PlaceholderFurniture';
import { PROTOTYPE_ROOM, getBlockingFootprints } from './prototype-room';
import { Room } from './Room';

const BACKGROUND_COLOR = '#0b1026';
/** Pointer travel (in pixels) above which a press is a camera drag, not a click. */
const CLICK_TOLERANCE = 6;
const AVATAR_START_CELL = { col: 6, row: 6 };

/** The HD-2D office view: a 3D diorama rendered with pixel-art textures. */
export function OfficeScene() {
  const layout = PROTOTYPE_ROOM;
  const grid = useMemo(
    () => buildWalkableGrid(layout.size, getBlockingFootprints(layout)),
    [layout],
  );
  const [walkRequest, setWalkRequest] = useState<WalkRequest | null>(null);

  const handleFloorClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > CLICK_TOLERANCE) return;
      const cell = worldToCell({ x: event.point.x, z: event.point.z }, layout.size);
      if (cell && isWalkable(grid, cell)) setWalkRequest({ cell });
    },
    [grid, layout.size],
  );

  return (
    <Canvas
      className="office-scene"
      shadows
      camera={{ fov: CAMERA_FOV, near: 0.5, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <hemisphereLight args={['#dfe9ff', '#5a4636', 1.1]} />
      <directionalLight position={[-6, 12, 8]} intensity={2.2} castShadow />
      <CameraRig layout={layout} />
      <Room layout={layout} onFloorClick={handleFloorClick} />
      {layout.furniture.map((item) => (
        <PlaceholderFurniture key={item.id} item={item} roomSize={layout.size} />
      ))}
      <Avatar
        roomSize={layout.size}
        grid={grid}
        startCell={AVATAR_START_CELL}
        walkRequest={walkRequest}
        seed={2026}
      />
    </Canvas>
  );
}
