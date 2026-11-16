import { useEffect, useState } from 'react';
import { getParisHour } from '../shared/simulation/paris-time';

/** How often the real Paris time is re-read. Light changes slowly, so this is plenty. */
const REFRESH_INTERVAL_MS = 15_000;

/** Current Paris time as a decimal hour, refreshed regularly. */
export function useParisHour(): number {
  const [hour, setHour] = useState(() => getParisHour(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setHour(getParisHour(new Date())), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return hour;
}

/**
 * Reads the optional `?heure=` URL parameter (decimal hour, e.g. 20.5),
 * handy to preview a moment of the day.
 */
export function readHourFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('heure');
  if (raw === null || raw.trim() === '') return null;
  const hour = Number(raw.replace(',', '.'));
  return Number.isFinite(hour) && hour >= 0 && hour <= 24 ? hour : null;
}
