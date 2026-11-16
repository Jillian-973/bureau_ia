import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { BufferAttribute, DoubleSide, PlaneGeometry, Vector3 } from 'three';
import type { Group, Texture } from 'three';
import { CAMERA_PITCH } from './camera-fit';
import { PIXELS_PER_UNIT } from './placeholder-textures';

/**
 * Sprites stand upright while the camera looks down at them, which squashes
 * them on screen. Stretching their height by 1 / cos(pitch) restores the
 * proportions of the original pixel art.
 */
export const SPRITE_HEIGHT_STRETCH = 1 / Math.cos(CAMERA_PITCH);

/** Share of the sprite colours that stays visible without any light. */
const SPRITE_MIN_BRIGHTNESS = 0.16;

const viewDirection = new Vector3();

/**
 * Flat quad whose normals fan out from left to right, as if the sprite were
 * a rounded shape. Lights coming from the side then shade it naturally
 * instead of leaving it black.
 */
function createSpriteGeometry(width: number, height: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height);
  geometry.translate(0, height / 2, 0);
  const positions = geometry.getAttribute('position');
  const normals = new Float32Array(positions.count * 3);
  const normal = new Vector3();
  for (let index = 0; index < positions.count; index++) {
    normal.set(Math.sign(positions.getX(index)) * 0.75, 0.3, 0.6).normalize();
    normal.toArray(normals, index * 3);
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}

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
  const geometry = useMemo(() => createSpriteGeometry(width, height), [width, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    camera.getWorldDirection(viewDirection);
    group.rotation.y = Math.atan2(-viewDirection.x, -viewDirection.z);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh geometry={geometry} castShadow={castShadow}>
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={SPRITE_MIN_BRIGHTNESS}
          alphaTest={0.5}
          side={DoubleSide}
          roughness={1}
        />
      </mesh>
      {children}
    </group>
  );
}
