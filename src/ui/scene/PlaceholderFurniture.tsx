/**
 * PLACEHOLDER FURNITURE — simple coloured volumes standing in for the final
 * voxel models. Each model is authored facing the camera (+Z) and centred on
 * its footprint; `quarterTurns` rotates it into place.
 */
import { useEffect, useMemo } from 'react';
import { DoubleSide } from 'three';
import { CELL_SIZE, footprintToWorld } from '../../shared/simulation/grid';
import type { GridSize } from '../../shared/simulation/grid';
import { createSeededRandom, pickRandom } from '../../shared/simulation/random';
import { PixelSprite } from './PixelSprite';
import {
  PLACEHOLDER_PLANT_SIZE,
  createPlaceholderPlantTexture,
  createPlaceholderRugTexture,
} from './placeholder-textures';
import type { FurnitureItem } from './prototype-room';

type Vec3 = [number, number, number];

const WOOD_DARK = '#6b4630';
const WOOD_MID = '#8f6443';
const WOOD_LIGHT = '#c99c6c';
const METAL = '#3d4257';
const PLASTIC_DARK = '#23263a';
const FABRIC = '#3f7f8f';
const FABRIC_LIGHT = '#5fa3b0';
const SCREEN_GLOW = '#8fd6ff';
const LAMP_GLOW = '#ffd9a0';
const BOOK_COLORS: readonly [string, ...string[]] = [
  '#b5483f',
  '#3f6fb5',
  '#4f9a5a',
  '#d1a23c',
  '#7a4fa3',
  '#d9d2c0',
];

interface BlockProps {
  size: Vec3;
  position: Vec3;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
}

/** A shaded box: the building brick of every placeholder model. */
function Block({ size, position, color, emissive, emissiveIntensity = 0 }: BlockProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

function Desk() {
  return (
    <group>
      <Block size={[1.84, 0.08, 0.82]} position={[0, 0.74, 0]} color={WOOD_LIGHT} />
      <Block size={[0.08, 0.7, 0.76]} position={[-0.84, 0.35, 0]} color={WOOD_MID} />
      <Block size={[0.08, 0.7, 0.76]} position={[0.84, 0.35, 0]} color={WOOD_MID} />
      <Block size={[1.6, 0.42, 0.05]} position={[0, 0.49, -0.34]} color={WOOD_MID} />
      {/* Monitor, turned towards the chair and the camera */}
      <Block size={[0.22, 0.03, 0.16]} position={[0, 0.795, -0.16]} color={PLASTIC_DARK} />
      <Block size={[0.06, 0.2, 0.05]} position={[0, 0.89, -0.18]} color={PLASTIC_DARK} />
      <Block size={[0.66, 0.42, 0.05]} position={[0, 1.14, -0.16]} color={PLASTIC_DARK} />
      <Block
        size={[0.58, 0.34, 0.02]}
        position={[0, 1.14, -0.13]}
        color="#1c2a44"
        emissive={SCREEN_GLOW}
        emissiveIntensity={1.4}
      />
      {/* Keyboard and mug */}
      <Block size={[0.42, 0.02, 0.14]} position={[0, 0.79, 0.16]} color="#d8dbe6" />
      <Block size={[0.08, 0.1, 0.08]} position={[0.55, 0.83, 0.1]} color="#e9e2d0" />
    </group>
  );
}

function Chair() {
  return (
    <group>
      <Block size={[0.36, 0.04, 0.36]} position={[0, 0.03, 0]} color={METAL} />
      <Block size={[0.07, 0.38, 0.07]} position={[0, 0.23, 0]} color={METAL} />
      <Block size={[0.52, 0.08, 0.5]} position={[0, 0.45, 0]} color={FABRIC} />
      <Block size={[0.5, 0.5, 0.08]} position={[0, 0.76, -0.23]} color={FABRIC_LIGHT} />
    </group>
  );
}

function Bookshelf() {
  // Three rows of books with seeded sizes and colours, so the shelf never changes.
  const books = useMemo(() => {
    const random = createSeededRandom(7);
    const result: Array<{ position: Vec3; size: Vec3; color: string }> = [];
    for (const shelfY of [0.14, 0.72, 1.3]) {
      let x = -0.82;
      while (x < 0.74) {
        const width = 0.09 + random() * 0.08;
        const height = 0.3 + random() * 0.14;
        result.push({
          position: [x + width / 2, shelfY + height / 2, 0.02],
          size: [width - 0.015, height, 0.3],
          color: pickRandom(BOOK_COLORS, random),
        });
        x += width;
      }
    }
    return result;
  }, []);

  return (
    <group position={[0, 0, -0.2]}>
      <Block size={[1.9, 1.9, 0.06]} position={[0, 0.95, -0.2]} color={WOOD_DARK} />
      <Block size={[0.08, 1.9, 0.46]} position={[-0.91, 0.95, 0]} color={WOOD_MID} />
      <Block size={[0.08, 1.9, 0.46]} position={[0.91, 0.95, 0]} color={WOOD_MID} />
      {[0.07, 0.65, 1.23, 1.86].map((y) => (
        <Block key={y} size={[1.9, 0.08, 0.46]} position={[0, y, 0]} color={WOOD_MID} />
      ))}
      {books.map((book, index) => (
        <Block key={index} size={book.size} position={book.position} color={book.color} />
      ))}
    </group>
  );
}

function Counter() {
  return (
    <group position={[0, 0, -0.15]}>
      <Block size={[1.9, 0.86, 0.62]} position={[0, 0.43, 0]} color={WOOD_MID} />
      <Block size={[1.96, 0.06, 0.68]} position={[0, 0.89, 0]} color="#e3ddd0" />
      {/* Coffee machine with its glowing light */}
      <Block size={[0.38, 0.46, 0.34]} position={[-0.5, 1.15, -0.05]} color={PLASTIC_DARK} />
      <Block size={[0.3, 0.04, 0.2]} position={[-0.5, 0.94, 0.14]} color={METAL} />
      <Block
        size={[0.06, 0.06, 0.02]}
        position={[-0.38, 1.28, 0.13]}
        color="#401010"
        emissive="#ff7a4a"
        emissiveIntensity={3}
      />
      <Block size={[0.09, 0.1, 0.09]} position={[-0.5, 1.01, 0.14]} color="#f1ece0" />
      {/* Spare mugs */}
      <Block size={[0.09, 0.1, 0.09]} position={[0.3, 0.97, 0.05]} color="#f1ece0" />
      <Block size={[0.09, 0.1, 0.09]} position={[0.46, 0.97, -0.05]} color="#c9584c" />
    </group>
  );
}

function FloorLamp() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.06, 8]} />
        <meshStandardMaterial color={METAL} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 6]} />
        <meshStandardMaterial color={METAL} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <cylinderGeometry args={[0.17, 0.28, 0.34, 8, 1, true]} />
        <meshStandardMaterial
          color="#f3e3c2"
          emissive={LAMP_GLOW}
          emissiveIntensity={1.2}
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Sofa() {
  return (
    <group>
      <Block size={[1.9, 0.36, 0.84]} position={[0, 0.2, 0]} color={FABRIC} />
      <Block size={[1.9, 0.5, 0.2]} position={[0, 0.63, -0.32]} color={FABRIC} />
      <Block size={[0.2, 0.3, 0.84]} position={[-0.85, 0.5, 0]} color={FABRIC} />
      <Block size={[0.2, 0.3, 0.84]} position={[0.85, 0.5, 0]} color={FABRIC} />
      <Block size={[0.7, 0.1, 0.56]} position={[-0.37, 0.42, 0.08]} color={FABRIC_LIGHT} />
      <Block size={[0.7, 0.1, 0.56]} position={[0.37, 0.42, 0.08]} color={FABRIC_LIGHT} />
    </group>
  );
}

function Plant() {
  const texture = useMemo(() => createPlaceholderPlantTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <PixelSprite
      texture={texture}
      pixelWidth={PLACEHOLDER_PLANT_SIZE.width}
      pixelHeight={PLACEHOLDER_PLANT_SIZE.height}
    />
  );
}

function Rug({ width, depth }: { width: number; depth: number }) {
  const texture = useMemo(() => createPlaceholderRugTexture(width, depth), [width, depth]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width - 0.2, depth - 0.2]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  );
}

interface PlaceholderFurnitureProps {
  item: FurnitureItem;
  roomSize: GridSize;
}

/** Places one furniture item on the floor grid. */
export function PlaceholderFurniture({ item, roomSize }: PlaceholderFurnitureProps) {
  const { x, z } = footprintToWorld(item.footprint, roomSize);
  const rotation = (item.quarterTurns * Math.PI) / 2;

  let model;
  switch (item.kind) {
    case 'desk':
      model = <Desk />;
      break;
    case 'chair':
      model = <Chair />;
      break;
    case 'bookshelf':
      model = <Bookshelf />;
      break;
    case 'counter':
      model = <Counter />;
      break;
    case 'floor-lamp':
      model = <FloorLamp />;
      break;
    case 'sofa':
      model = <Sofa />;
      break;
    case 'plant':
      model = <Plant />;
      break;
    case 'rug':
      model = (
        <Rug width={item.footprint.width * CELL_SIZE} depth={item.footprint.depth * CELL_SIZE} />
      );
      break;
  }

  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      {model}
    </group>
  );
}
