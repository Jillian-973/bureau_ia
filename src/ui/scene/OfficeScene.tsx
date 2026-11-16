import { Canvas } from '@react-three/fiber';
import { CameraRig } from './CameraRig';
import { CAMERA_FOV } from './camera-fit';
import { PlaceholderFurniture } from './PlaceholderFurniture';
import { PROTOTYPE_ROOM } from './prototype-room';
import { Room } from './Room';

const BACKGROUND_COLOR = '#0b1026';

/** The HD-2D office view: a 3D diorama rendered with pixel-art textures. */
export function OfficeScene() {
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
      <CameraRig layout={PROTOTYPE_ROOM} />
      <Room layout={PROTOTYPE_ROOM} />
      {PROTOTYPE_ROOM.furniture.map((item) => (
        <PlaceholderFurniture key={item.id} item={item} roomSize={PROTOTYPE_ROOM.size} />
      ))}
    </Canvas>
  );
}
