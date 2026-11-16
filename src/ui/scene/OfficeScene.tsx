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
import { FpsMonitor } from './FpsMonitor';
import { Lighting } from './Lighting';
import { PlaceholderFurniture } from './PlaceholderFurniture';
import { PROTOTYPE_ROOM, getBlockingFootprints } from './prototype-room';
import { QUALITY_SETTINGS } from './quality';
import type { QualityLevel } from './quality';
import { QualityContext } from './quality-context';
import { Room } from './Room';

const BACKGROUND_COLOR = '#0b1026';
/** Pointer travel (in pixels) above which a press is a camera drag, not a click. */
const CLICK_TOLERANCE = 6;
const AVATAR_START_CELL = { col: 6, row: 6 };
const CAMERA_SETTINGS = { fov: CAMERA_FOV, near: 0.5, far: 120 };
const RENDERER_SETTINGS = {
  antialias: true,
  powerPreference: 'high-performance',
  toneMapping: NeutralToneMapping,
} as const;

interface OfficeSceneProps {
  /** Paris time as a decimal hour; drives the whole lighting. */
  hour: number;
  quality: QualityLevel;
  /** Called when the frame rate stays too low at the current quality. */
  onLowPerformance: () => void;
}

/** The HD-2D office view: a 3D diorama rendered with pixel-art textures. */
export function OfficeScene({ hour, quality, onLowPerformance }: OfficeSceneProps) {
  const layout = PROTOTYPE_ROOM;
  const settings = QUALITY_SETTINGS[quality];
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
      shadows="percentage"
      dpr={[1, settings.maxPixelRatio]}
      camera={CAMERA_SETTINGS}
      gl={RENDERER_SETTINGS}
    >
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <CameraRig layout={layout} />
      <FpsMonitor level={quality} onLowPerformance={onLowPerformance} />
      {/* The canvas is a separate React tree: contexts are provided inside it. */}
      <QualityContext.Provider value={settings}>
        <DaylightContext.Provider value={daylight}>
          <Lighting shadowExtent={shadowExtent} />
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
      </QualityContext.Provider>
      {settings.effects !== 'none' && <Effects level={settings.effects} />}
    </Canvas>
  );
}
