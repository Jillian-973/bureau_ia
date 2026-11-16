import { createContext, useContext } from 'react';
import { QUALITY_SETTINGS } from './quality';
import type { QualitySettings } from './quality';

/** Active graphics settings, shared with every object of the scene. */
export const QualityContext = createContext<QualitySettings>(QUALITY_SETTINGS.high);

export function useQualitySettings(): QualitySettings {
  return useContext(QualityContext);
}
