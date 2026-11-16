/**
 * The office lives on Paris time, whatever the time zone of the device.
 */
const PARIS_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Paris local time as a decimal hour in [0, 24), e.g. 14.5 for 14:30. */
export function getParisHour(date: Date): number {
  const parts = PARIS_CLOCK.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return read('hour') + read('minute') / 60 + read('second') / 3600;
}

/** Formats a decimal hour as HH:MM. */
export function formatHour(hour: number): string {
  const totalMinutes = Math.round((((hour % 24) + 24) % 24) * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
