/**
 * Day-night cycle: turns a Paris hour into lighting parameters.
 * Pure and deterministic, so the same hour always gives the same light.
 * Colours are 0xRRGGBB numbers in sRGB.
 */
export interface Daylight {
  /** Unit vector pointing from the room towards the main light (sun or moon). */
  lightDirection: [number, number, number];
  lightColor: number;
  lightIntensity: number;
  /** Ambient light coming from the sky and bounced by the ground. */
  skyColor: number;
  groundColor: number;
  ambientIntensity: number;
  /** What is seen through the windows. */
  windowColor: number;
  windowGlow: number;
  /** 0 = indoor lamps off, 1 = fully on. */
  lampLevel: number;
}

interface Keyframe {
  hour: number;
  lightColor: number;
  lightIntensity: number;
  skyColor: number;
  groundColor: number;
  ambientIntensity: number;
  windowColor: number;
  windowGlow: number;
  lampLevel: number;
}

/** Hours between which the sun is up; the moon lights the rest of the night. */
export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 21;

const NIGHT = {
  lightColor: 0x8fa8ff,
  lightIntensity: 0.5,
  skyColor: 0x3a4a8c,
  groundColor: 0x1e1c3a,
  ambientIntensity: 0.8,
  windowColor: 0x141c3d,
  windowGlow: 0.15,
  lampLevel: 1,
};

/**
 * The main light fades almost to zero at sunrise and sunset: that is when it
 * switches between the moon and the sun, so the jump in direction is invisible.
 */
const KEYFRAMES: Keyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 5.25, ...NIGHT },
  { hour: SUNRISE_HOUR, ...NIGHT, lightIntensity: 0.03, skyColor: 0x4a4f86, windowColor: 0x3a3f78, windowGlow: 0.3 },
  {
    hour: 7.25,
    lightColor: 0xffb07a,
    lightIntensity: 1.3,
    skyColor: 0xf0b8a0,
    groundColor: 0x5a4050,
    ambientIntensity: 0.9,
    windowColor: 0xffc9a0,
    windowGlow: 0.8,
    lampLevel: 0.5,
  },
  {
    hour: 9,
    lightColor: 0xffe6c4,
    lightIntensity: 2.3,
    skyColor: 0xcfe2ff,
    groundColor: 0x6b5a4a,
    ambientIntensity: 0.95,
    windowColor: 0xbfe0ff,
    windowGlow: 1,
    lampLevel: 0,
  },
  {
    hour: 13,
    lightColor: 0xfff6e6,
    lightIntensity: 2.7,
    skyColor: 0xdbeaff,
    groundColor: 0x75634f,
    ambientIntensity: 1.05,
    windowColor: 0xcfeaff,
    windowGlow: 1.15,
    lampLevel: 0,
  },
  {
    hour: 17.5,
    lightColor: 0xffe0b0,
    lightIntensity: 2.3,
    skyColor: 0xd6e0f5,
    groundColor: 0x6b5a4a,
    ambientIntensity: 0.95,
    windowColor: 0xc9e0ff,
    windowGlow: 1,
    lampLevel: 0,
  },
  {
    hour: 19.75,
    lightColor: 0xffb07a,
    lightIntensity: 1.5,
    skyColor: 0xf2b9a0,
    groundColor: 0x5a4050,
    ambientIntensity: 0.9,
    windowColor: 0xff9d6e,
    windowGlow: 0.9,
    lampLevel: 0.7,
  },
  { hour: SUNSET_HOUR, ...NIGHT, lightIntensity: 0.03, skyColor: 0x4a4f86, windowColor: 0x3a3f78, windowGlow: 0.3 },
  { hour: 22, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const MOON_DIRECTION = normalize([-0.35, 1, 0.45]);

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function mix(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

function mixColor(from: number, to: number, ratio: number): number {
  const channel = (shift: number) =>
    Math.round(mix((from >> shift) & 0xff, (to >> shift) & 0xff, ratio)) << shift;
  return channel(16) | channel(8) | channel(0);
}

/** Brings any hour back into [0, 24). */
export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/**
 * Direction of the main light. The sun rises on the left of the room, climbs,
 * and sets on the right, always leaning towards the camera so the visible
 * faces stay lit. At night the moon shines from a fixed position.
 */
function computeLightDirection(hour: number): [number, number, number] {
  if (hour < SUNRISE_HOUR || hour >= SUNSET_HOUR) return MOON_DIRECTION;
  const progress = (hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  return normalize([
    -Math.cos(Math.PI * progress),
    0.4 + Math.sin(Math.PI * progress),
    0.7,
  ]);
}

/** Lighting of the office at a given Paris hour (decimal, any value is wrapped). */
export function computeDaylight(rawHour: number): Daylight {
  const hour = wrapHour(rawHour);
  let nextIndex = KEYFRAMES.findIndex((keyframe) => keyframe.hour > hour);
  if (nextIndex <= 0) nextIndex = KEYFRAMES.length - 1;
  const next = KEYFRAMES[nextIndex] ?? { hour: 24, ...NIGHT };
  const previous = KEYFRAMES[nextIndex - 1] ?? { hour: 0, ...NIGHT };
  const ratio = (hour - previous.hour) / (next.hour - previous.hour);

  return {
    lightDirection: computeLightDirection(hour),
    lightColor: mixColor(previous.lightColor, next.lightColor, ratio),
    lightIntensity: mix(previous.lightIntensity, next.lightIntensity, ratio),
    skyColor: mixColor(previous.skyColor, next.skyColor, ratio),
    groundColor: mixColor(previous.groundColor, next.groundColor, ratio),
    ambientIntensity: mix(previous.ambientIntensity, next.ambientIntensity, ratio),
    windowColor: mixColor(previous.windowColor, next.windowColor, ratio),
    windowGlow: mix(previous.windowGlow, next.windowGlow, ratio),
    lampLevel: mix(previous.lampLevel, next.lampLevel, ratio),
  };
}
