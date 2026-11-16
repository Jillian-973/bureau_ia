import { describe, expect, it } from 'vitest';
import { SUNRISE_HOUR, SUNSET_HOUR, computeDaylight } from '../../src/shared/simulation/daylight';
import { formatHour, getParisHour } from '../../src/shared/simulation/paris-time';

describe('getParisHour', () => {
  it('uses winter time (UTC+1)', () => {
    expect(getParisHour(new Date('2026-01-15T12:00:00Z'))).toBe(13);
  });

  it('uses summer time (UTC+2)', () => {
    expect(getParisHour(new Date('2026-07-15T12:30:00Z'))).toBe(14.5);
  });

  it('stays below 24 just before midnight', () => {
    expect(getParisHour(new Date('2026-01-15T22:59:59Z'))).toBeCloseTo(23.9997, 3);
  });
});

describe('formatHour', () => {
  it('formats decimal hours', () => {
    expect(formatHour(0)).toBe('00:00');
    expect(formatHour(14.5)).toBe('14:30');
    expect(formatHour(23.999)).toBe('00:00');
  });
});

describe('computeDaylight', () => {
  it('is deterministic', () => {
    expect(computeDaylight(10.3)).toEqual(computeDaylight(10.3));
  });

  it('is bright at noon with the lamps off', () => {
    const noon = computeDaylight(13);
    expect(noon.lightIntensity).toBeGreaterThan(2);
    expect(noon.lampLevel).toBe(0);
  });

  it('is dark at night with the lamps on', () => {
    const night = computeDaylight(2);
    expect(night.lightIntensity).toBeLessThan(computeDaylight(13).lightIntensity / 4);
    expect(night.lampLevel).toBe(1);
  });

  it('turns the lamps on in the evening', () => {
    expect(computeDaylight(20.5).lampLevel).toBeGreaterThan(0.7);
  });

  it('wraps hours outside 0-24', () => {
    expect(computeDaylight(26)).toEqual(computeDaylight(2));
    expect(computeDaylight(-1)).toEqual(computeDaylight(23));
  });

  it('always lights the room from above with a unit direction', () => {
    for (let hour = 0; hour < 24; hour += 0.1) {
      const [x, y, z] = computeDaylight(hour).lightDirection;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
      expect(y).toBeGreaterThan(0.15);
      expect(z).toBeGreaterThan(0);
    }
  });

  it('changes smoothly over the whole day, including at midnight', () => {
    const stepHours = 0.02;
    for (let hour = 0; hour < 24; hour += stepHours) {
      const now = computeDaylight(hour);
      const soon = computeDaylight(hour + stepHours);
      expect(Math.abs(soon.lightIntensity - now.lightIntensity)).toBeLessThan(0.08);
      expect(Math.abs(soon.ambientIntensity - now.ambientIntensity)).toBeLessThan(0.02);
      expect(Math.abs(soon.lampLevel - now.lampLevel)).toBeLessThan(0.03);
    }
  });

  it('is almost dark when the sun and the moon swap', () => {
    expect(computeDaylight(SUNRISE_HOUR).lightIntensity).toBeLessThan(0.05);
    expect(computeDaylight(SUNSET_HOUR).lightIntensity).toBeLessThan(0.05);
  });
});
