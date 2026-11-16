import { useLayoutEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import { useDaylight } from './daylight-context';
import { useQualitySettings } from './quality-context';

/** Distance of the sun/moon light from the room centre. */
const LIGHT_DISTANCE = 30;

interface LightingProps {
  /** Half-size of the area that must be covered by shadows, in world units. */
  shadowExtent: number;
}

/** Sky ambience and the main directional light (sun by day, moon by night). */
export function Lighting({ shadowExtent }: LightingProps) {
  const daylight = useDaylight();
  const { shadows, shadowMapSize } = useQualitySettings();
  const lightRef = useRef<DirectionalLight>(null);
  const [x, y, z] = daylight.lightDirection;

  // The shadow map is not reactive: rebuild it when its size or bounds change.
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.camera.updateProjectionMatrix();
  }, [shadowExtent, shadowMapSize]);

  return (
    <>
      <hemisphereLight
        color={daylight.skyColor}
        groundColor={daylight.groundColor}
        intensity={daylight.ambientIntensity}
      />
      <directionalLight
        ref={lightRef}
        position={[x * LIGHT_DISTANCE, y * LIGHT_DISTANCE, z * LIGHT_DISTANCE]}
        color={daylight.lightColor}
        intensity={daylight.lightIntensity}
        castShadow={shadows}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-shadowExtent, shadowExtent, shadowExtent, -shadowExtent, 1, LIGHT_DISTANCE * 2]}
        />
      </directionalLight>
    </>
  );
}
