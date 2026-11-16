/**
 * Graphics quality: three levels trading visual finesse for frame rate.
 * Pure data and functions, no browser API, so they are easy to test.
 */
export type QualityLevel = 'high' | 'medium' | 'low';
/** 'auto' picks a level for the device and lowers it if rendering is too slow. */
export type QualityMode = 'auto' | QualityLevel;

export interface QualitySettings {
  /** Upper bound of the device pixel ratio used for rendering. */
  maxPixelRatio: number;
  /** Real-time shadows; when off, sprites get a simple dark spot instead. */
  shadows: boolean;
  shadowMapSize: number;
  /** Post-processing variant, or 'none' for a plain render with a CSS vignette. */
  effects: 'full' | 'light' | 'none';
}

/** From the most to the least demanding. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['high', 'medium', 'low'];

export const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 'full' },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, effects: 'light' },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 512, effects: 'none' },
};

/** Interface labels (French). */
export const QUALITY_LABELS: Record<QualityMode, string> = {
  auto: 'Auto',
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Basse',
};

/** Frame rate under which the automatic mode lowers the quality. */
export const MIN_ACCEPTABLE_FPS = 30;

/** Level used at start-up in automatic mode: medium on touch devices, high elsewhere. */
export function detectInitialQuality(device: { isTouchDevice: boolean }): QualityLevel {
  return device.isTouchDevice ? 'medium' : 'high';
}

/** The next less demanding level, or null when already at the lowest. */
export function lowerQuality(level: QualityLevel): QualityLevel | null {
  return QUALITY_LEVELS[QUALITY_LEVELS.indexOf(level) + 1] ?? null;
}

const MODE_ALIASES: Record<string, QualityMode> = {
  auto: 'auto',
  high: 'high',
  medium: 'medium',
  low: 'low',
  elevee: 'high',
  haute: 'high',
  moyenne: 'medium',
  basse: 'low',
};

/**
 * Reads a quality mode from user-provided text (stored preference or the
 * `?qualite=` URL parameter). Accepts French names, with or without accents.
 */
export function parseQualityMode(text: string | null | undefined): QualityMode | null {
  if (!text) return null;
  const key = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return MODE_ALIASES[key] ?? null;
}
