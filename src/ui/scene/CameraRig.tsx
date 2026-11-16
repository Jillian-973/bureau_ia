import { MapControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import { CELL_SIZE } from '../../shared/simulation/grid';
import { CAMERA_OFFSET_DIRECTION, computeCameraFit } from './camera-fit';
import type { RoomLayout } from './prototype-room';

/** How far the user may zoom in, as a fraction of the "whole room visible" distance. */
const MIN_ZOOM_DISTANCE_RATIO = 0.45;

interface CameraRigProps {
  layout: RoomLayout;
}

/**
 * Fixed high-angle camera: it frames the whole room, never rotates, and only
 * allows a bounded pan and a limited zoom.
 */
export function CameraRig({ layout }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const controlsRef = useRef<ComponentRef<typeof MapControls>>(null);

  const width = layout.size.cols * CELL_SIZE;
  const depth = layout.size.rows * CELL_SIZE;
  const fit = useMemo(
    () => computeCameraFit({ width, depth, height: layout.wallHeight }, aspect),
    [width, depth, layout.wallHeight, aspect],
  );

  // Re-frame the room whenever the viewport changes shape.
  useLayoutEffect(() => {
    const [tx, ty, tz] = fit.target;
    const [dx, dy, dz] = CAMERA_OFFSET_DIRECTION;
    camera.position.set(tx + dx * fit.distance, ty + dy * fit.distance, tz + dz * fit.distance);
    camera.lookAt(tx, ty, tz);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(tx, ty, tz);
      controls.update();
    }
  }, [camera, fit]);

  // Keep the look-at point above the room so the user cannot pan into the void.
  const clampPan = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const [tx, , tz] = fit.target;
    const target = controls.target;
    const clampedX = Math.min(tx + width / 2, Math.max(tx - width / 2, target.x));
    const clampedZ = Math.min(tz + depth / 2, Math.max(tz - depth / 2, target.z));
    const shiftX = clampedX - target.x;
    const shiftZ = clampedZ - target.z;
    if (shiftX === 0 && shiftZ === 0) return;
    target.x += shiftX;
    target.z += shiftZ;
    camera.position.x += shiftX;
    camera.position.z += shiftZ;
  }, [camera, fit, width, depth]);

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableRotate={false}
      enableDamping={false}
      screenSpacePanning={false}
      minDistance={fit.distance * MIN_ZOOM_DISTANCE_RATIO}
      maxDistance={fit.distance}
      onChange={clampPan}
    />
  );
}
