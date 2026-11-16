/**
 * Fixed high-angle camera maths. The camera never rotates: it looks down at
 * CAMERA_PITCH and only moves (pan) or changes distance (limited zoom).
 */
export const CAMERA_PITCH = (35 * Math.PI) / 180;
export const CAMERA_FOV = 28;

/** Extra room kept around the scene so it never touches the viewport edges. */
const FIT_MARGIN = 1.06;

export interface RoomBounds {
  width: number;
  depth: number;
  height: number;
}

export interface CameraFit {
  /** Point the camera looks at, in world coordinates. */
  target: [number, number, number];
  /** Distance from the target at which the whole room is visible. */
  distance: number;
}

/** Unit vector going from the look-at target towards the camera. */
export const CAMERA_OFFSET_DIRECTION: [number, number, number] = [
  0,
  Math.sin(CAMERA_PITCH),
  Math.cos(CAMERA_PITCH),
];

/**
 * Computes the look-at target and the distance that make a room (centred on
 * the origin, floor at y = 0) fill the viewport without being cropped.
 */
export function computeCameraFit(bounds: RoomBounds, aspect: number): CameraFit {
  const sin = Math.sin(CAMERA_PITCH);
  const cos = Math.cos(CAMERA_PITCH);
  const halfWidth = bounds.width / 2;
  const halfDepth = bounds.depth / 2;

  // Camera basis: right = +X, up = (0, cos, -sin), towards camera = (0, sin, cos).
  const upOf = (y: number, z: number) => y * cos - z * sin;
  const towardsCameraOf = (y: number, z: number) => y * sin + z * cos;

  // Centre the view vertically between the front floor edge and the top of the back wall.
  const lowest = upOf(0, halfDepth);
  const highest = upOf(bounds.height, -halfDepth);
  const centerUp = (lowest + highest) / 2;
  const target: [number, number, number] = [0, centerUp * cos, -centerUp * sin];

  const tanVertical = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;

  let distance = 0;
  for (const y of [0, bounds.height]) {
    for (const z of [-halfDepth, halfDepth]) {
      const up = Math.abs(upOf(y, z) - centerUp);
      const depth = towardsCameraOf(y - target[1], z - target[2]);
      distance = Math.max(distance, up / tanVertical + depth, halfWidth / tanHorizontal + depth);
    }
  }
  return { target, distance: distance * FIT_MARGIN };
}
