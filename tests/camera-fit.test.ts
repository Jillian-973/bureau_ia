import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV,
  CAMERA_OFFSET_DIRECTION,
  CAMERA_PITCH,
  computeCameraFit,
} from '../src/ui/scene/camera-fit';

const bounds = { width: 12, depth: 10, height: 2.5 };

/** Projects a world point and returns its normalised screen coordinates (-1..1). */
function project(point: [number, number, number], aspect: number) {
  const fit = computeCameraFit(bounds, aspect);
  const sin = Math.sin(CAMERA_PITCH);
  const cos = Math.cos(CAMERA_PITCH);
  const [x, y, z] = [point[0] - fit.target[0], point[1] - fit.target[1], point[2] - fit.target[2]];
  const depth = fit.distance - (y * sin + z * cos);
  const tanVertical = Math.tan((CAMERA_FOV * Math.PI) / 360);
  return {
    x: x / (depth * tanVertical * aspect),
    y: (y * cos - z * sin) / (depth * tanVertical),
  };
}

describe('computeCameraFit', () => {
  it('keeps the camera above and in front of the room', () => {
    expect(CAMERA_OFFSET_DIRECTION[1]).toBeGreaterThan(0);
    expect(CAMERA_OFFSET_DIRECTION[2]).toBeGreaterThan(0);
  });

  it.each([16 / 9, 4 / 3, 1, 9 / 16, 3])('keeps every corner on screen at aspect %f', (aspect) => {
    for (const x of [-6, 6]) {
      for (const y of [0, 2.5]) {
        for (const z of [-5, 5]) {
          const screen = project([x, y, z], aspect);
          expect(Math.abs(screen.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(screen.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('moves the camera back on narrow viewports', () => {
    expect(computeCameraFit(bounds, 9 / 16).distance).toBeGreaterThan(
      computeCameraFit(bounds, 16 / 9).distance,
    );
  });
});
