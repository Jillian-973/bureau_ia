import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';
import { NeutralToneMapping } from 'three';
import { computeDaylight } from '../../shared/simulation/daylight';
import { buildWalkableGrid, isWalkable, worldToCell } from '../../shared/simulation/grid';
import { Avatar } from '../avatars/Avatar';
import type { WalkRequest } from '../avatars/Avatar';
import { CameraRig } from './CameraRig';
import { CAMERA_FOV } from './camera-fit';
import { DaylightContext } from './daylight-context';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { PlaceholderFurniture } from './PlaceholderFurniture';
import { PROTOTYPE_ROOM, getBlockingFootprints } from './prototype-room';
import { Room } from './Room';

const BACKGROUND_COLOR = '#0b1026';
/** Pointer travel (in pixels) above which a press is a camera drag, not a click. */
const CLICK_TOLERANCE = 6;
const AVATAR_START_CELL = { col: 6, row: 6 };

interface OfficeSceneProps {
  /** Paris time as a decimal hour; drives the whole lighting. */
  hour: number;
}

/** The HD-2D office view: a 3D diorama rendered with pixel-art textures. */
export function OfficeScene({ hour }: OfficeSceneProps) {
  const layout = PROTOTYPE_ROOM;
  const daylight = useMemo(() => computeDaylight(hour), [hour]);
  // Shadows must cover the whole room, walls included, from any sun angle.
  const shadowExtent = Math.hypot(layout.size.cols, layout.size.rows) / 2 + layout.wallHeight;
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
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
    >
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <CameraRig layout={layout} />
      {/* The canvas is a separate React tree: the context is provided inside it. */}
      <DaylightContext.Provider value={daylight}>
        <Lighting shadowExtent={shadowExtent} shadowMapSize={2048} />
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
      </DaylightContext.Provider>
      <Effects level="full" />
    </Canvas>
  );
}
