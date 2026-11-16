import { describe, expect, it } from 'vitest';
import {
  QUALITY_LEVELS,
  QUALITY_SETTINGS,
  detectInitialQuality,
  lowerQuality,
  parseQualityMode,
} from '../../src/ui/scene/quality';

describe('quality levels', () => {
  it('offers exactly three levels, each cheaper than the previous one', () => {
    expect(QUALITY_LEVELS).toEqual(['high', 'medium', 'low']);
    const [high, medium, low] = QUALITY_LEVELS.map((level) => QUALITY_SETTINGS[level]);
    expect(high!.maxPixelRatio).toBeGreaterThan(medium!.maxPixelRatio);
    expect(medium!.maxPixelRatio).toBeGreaterThan(low!.maxPixelRatio);
    expect(high!.shadowMapSize).toBeGreaterThan(medium!.shadowMapSize);
    expect(low!.shadows).toBe(false);
    expect(low!.effects).toBe('none');
  });

  it('starts at medium on touch devices and high elsewhere', () => {
    expect(detectInitialQuality({ isTouchDevice: true })).toBe('medium');
    expect(detectInitialQuality({ isTouchDevice: false })).toBe('high');
  });

  it('lowers one level at a time and stops at the lowest', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });
});

describe('parseQualityMode', () => {
  it('accepts French names with or without accents', () => {
    expect(parseQualityMode('élevée')).toBe('high');
    expect(parseQualityMode('Elevee')).toBe('high');
    expect(parseQualityMode('haute')).toBe('high');
    expect(parseQualityMode(' moyenne ')).toBe('medium');
    expect(parseQualityMode('basse')).toBe('low');
    expect(parseQualityMode('auto')).toBe('auto');
  });

  it('accepts the internal names used for storage', () => {
    expect(parseQualityMode('medium')).toBe('medium');
  });

  it('rejects anything else', () => {
    expect(parseQualityMode('ultra')).toBeNull();
    expect(parseQualityMode('')).toBeNull();
    expect(parseQualityMode(null)).toBeNull();
  });
});
