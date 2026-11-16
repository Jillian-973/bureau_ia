import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { cellToWorld, isWalkable, sameCell } from '../../shared/simulation/grid';
import type { Cell, GridSize, WalkableGrid, WorldPoint } from '../../shared/simulation/grid';
import { createSeededRandom } from '../../shared/simulation/random';
import { PixelSprite } from '../scene/PixelSprite';
import { findPath } from './pathfinding';
import {
  AVATAR_FRAME,
  createPlaceholderAvatarTexture,
  selectAvatarFrame,
} from './placeholder-avatar-sprite';
import type { AvatarDirection } from './placeholder-avatar-sprite';

/** Walking speed, in cells per second. */
const WALK_SPEED = 2.4;
/** Animation speed of the walk cycle, in frames per second. */
const WALK_FRAME_RATE = 8;
/** Seconds the avatar waits before strolling somewhere on its own. */
const WANDER_DELAY = { min: 2.5, max: 6 };
/** Largest time step simulated at once, so a paused tab does not teleport the avatar. */
const MAX_TIME_STEP = 0.1;

/** A destination picked by the user. A new object starts a new walk. */
export interface WalkRequest {
  cell: Cell;
}

interface AvatarProps {
  roomSize: GridSize;
  grid: WalkableGrid;
  startCell: Cell;
  walkRequest: WalkRequest | null;
  /** Seed of the idle strolls, so they are reproducible. */
  seed: number;
}

interface MotionState {
  cell: Cell;
  position: WorldPoint;
  /** Cells still to walk through, the first one being entered right now. */
  path: Cell[];
  direction: AvatarDirection;
  walkTime: number;
  idleTime: number;
  nextWanderIn: number;
  /** Destination chosen by the user, shown with a marker until reached. */
  userTarget: Cell | null;
}

/** A pixel-art character that walks on the floor grid and strolls when idle. */
export function Avatar({ roomSize, grid, startCell, walkRequest, seed }: AvatarProps) {
  const texture = useMemo(() => createPlaceholderAvatarTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  const random = useMemo(() => createSeededRandom(seed), [seed]);
  const groupRef = useRef<Group>(null);
  const markerRef = useRef<Mesh>(null);
  const motion = useRef<MotionState>({
    cell: startCell,
    position: cellToWorld(startCell, roomSize),
    path: [],
    direction: 'down',
    walkTime: 0,
    idleTime: 0,
    nextWanderIn: WANDER_DELAY.min,
    userTarget: null,
  });

  const walkTo = useCallback(
    (target: Cell): boolean => {
      const state = motion.current;
      // When already moving, finish entering the next cell before changing course.
      const entering = state.path[0];
      const path = findPath(grid, entering ?? state.cell, target);
      if (!path) return false;
      state.path = entering ? [entering, ...path] : path;
      return true;
    },
    [grid],
  );

  useEffect(() => {
    if (walkRequest && walkTo(walkRequest.cell)) motion.current.userTarget = walkRequest.cell;
  }, [walkRequest, walkTo]);

  const pickStrollTarget = useCallback((): Cell | null => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = {
        col: Math.floor(random() * roomSize.cols),
        row: Math.floor(random() * roomSize.rows),
      };
      if (isWalkable(grid, candidate) && !sameCell(candidate, motion.current.cell)) return candidate;
    }
    return null;
  }, [grid, random, roomSize]);

  useFrame((frameState, delta) => {
    const state = motion.current;
    const step = Math.min(delta, MAX_TIME_STEP);

    // Advance along the path, possibly through several cells in one frame.
    let remaining = WALK_SPEED * step;
    while (remaining > 0 && state.path.length > 0) {
      const next = state.path[0];
      if (!next) break;
      const goal = cellToWorld(next, roomSize);
      const dx = goal.x - state.position.x;
      const dz = goal.z - state.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1e-6) {
        if (Math.abs(dx) > Math.abs(dz)) state.direction = dx > 0 ? 'right' : 'left';
        else state.direction = dz > 0 ? 'down' : 'up';
      }
      if (distance <= remaining) {
        state.position = goal;
        state.cell = next;
        state.path.shift();
        remaining -= distance;
      } else {
        state.position = {
          x: state.position.x + (dx / distance) * remaining,
          z: state.position.z + (dz / distance) * remaining,
        };
        remaining = 0;
      }
    }

    const walking = state.path.length > 0;
    if (walking) {
      state.walkTime += step;
      state.idleTime = 0;
    } else {
      state.walkTime = 0;
      state.userTarget = null;
      state.idleTime += step;
      if (state.idleTime >= state.nextWanderIn) {
        const target = pickStrollTarget();
        if (target) walkTo(target);
        state.idleTime = 0;
        state.nextWanderIn = WANDER_DELAY.min + random() * (WANDER_DELAY.max - WANDER_DELAY.min);
      }
    }

    selectAvatarFrame(
      texture,
      state.direction,
      walking ? 1 + Math.floor(state.walkTime * WALK_FRAME_RATE) : 0,
    );
    groupRef.current?.position.set(state.position.x, 0, state.position.z);

    const marker = markerRef.current;
    if (marker) {
      marker.visible = state.userTarget !== null;
      if (state.userTarget) {
        const point = cellToWorld(state.userTarget, roomSize);
        marker.position.set(point.x, 0.03, point.z);
        marker.scale.setScalar(1 + 0.12 * Math.sin(frameState.clock.elapsedTime * 6));
      }
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <PixelSprite
          texture={texture}
          pixelWidth={AVATAR_FRAME.width}
          pixelHeight={AVATAR_FRAME.height}
        />
      </group>
      {/* Destination marker */}
      <mesh ref={markerRef} rotation={[-Math.PI / 2, 0, Math.PI / 4]} visible={false}>
        <ringGeometry args={[0.3, 0.4, 4]} />
        <meshBasicMaterial color="#ffd66b" toneMapped={false} />
      </mesh>
    </>
  );
}
