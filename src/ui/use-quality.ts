import { useCallback, useState } from 'react';
import { detectInitialQuality, lowerQuality, parseQualityMode } from './scene/quality';
import type { QualityLevel, QualityMode } from './scene/quality';

const STORAGE_KEY = 'bureau:qualite';

/** Storage can be unavailable (private mode, sandboxed iframe): never let it break the app. */
function readStoredMode(): QualityMode | null {
  try {
    return parseQualityMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeMode(mode: QualityMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The choice simply will not be remembered.
  }
}

/** Optional `?qualite=` URL parameter (elevee, moyenne, basse, auto). It wins over the stored choice. */
function readModeFromUrl(): QualityMode | null {
  return parseQualityMode(new URLSearchParams(window.location.search).get('qualite'));
}

function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export interface QualityState {
  /** What the user chose: a fixed level, or automatic. */
  mode: QualityMode;
  /** Level actually applied. */
  level: QualityLevel;
  setMode: (mode: QualityMode) => void;
  /** To call when rendering is too slow; lowers the level in automatic mode. */
  reportLowPerformance: () => void;
}

/** Graphics quality choice, remembered between visits. */
export function useQuality(): QualityState {
  const [mode, setModeState] = useState<QualityMode>(
    () => readModeFromUrl() ?? readStoredMode() ?? 'auto',
  );
  const [autoLevel, setAutoLevel] = useState<QualityLevel>(() =>
    detectInitialQuality({ isTouchDevice: isTouchDevice() }),
  );

  const setMode = useCallback((next: QualityMode) => {
    setModeState(next);
    storeMode(next);
  }, []);

  const reportLowPerformance = useCallback(() => {
    setAutoLevel((current) => lowerQuality(current) ?? current);
  }, []);

  return { mode, level: mode === 'auto' ? autoLevel : mode, setMode, reportLowPerformance };
}
