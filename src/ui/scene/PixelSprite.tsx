import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { DoubleSide, Vector3 } from 'three';
import type { Group, Texture } from 'three';
import { CAMERA_PITCH } from './camera-fit';
import { PIXELS_PER_UNIT } from './placeholder-textures';

/**
 * Sprites stand upright while the camera looks down at them, which squashes
 * them on screen. Stretching their height by 1 / cos(pitch) restores the
 * proportions of the original pixel art.
 */
export const SPRITE_HEIGHT_STRETCH = 1 / Math.cos(CAMERA_PITCH);

const viewDirection = new Vector3();

interface PixelSpriteProps {
  texture: Texture;
  /** Size of one frame, in texture pixels. */
  pixelWidth: number;
  pixelHeight: number;
  position?: [number, number, number];
  castShadow?: boolean;
  children?: ReactNode;
}

/**
 * Upright pixel-art sprite anchored at its feet. It always turns around the
 * vertical axis to face the camera, and is lit like the rest of the scene.
 */
export function PixelSprite({
  texture,
  pixelWidth,
  pixelHeight,
  position,
  castShadow = true,
  children,
}: PixelSpriteProps) {
  const groupRef = useRef<Group>(null);
  const width = pixelWidth / PIXELS_PER_UNIT;
  const height = (pixelHeight / PIXELS_PER_UNIT) * SPRITE_HEIGHT_STRETCH;

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    camera.getWorldDirection(viewDirection);
    group.rotation.y = Math.atan2(-viewDirection.x, -viewDirection.z);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, height / 2, 0]} castShadow={castShadow}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} alphaTest={0.5} side={DoubleSide} roughness={1} />
      </mesh>
      {children}
    </group>
  );
}
