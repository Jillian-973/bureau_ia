/**
 * Password check and limit on failed attempts. There is one user and one
 * password, kept as a Worker secret (never in the code or the database).
 */

/** A shorter password is refused outright: the office must not open with a weak one. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const encoder = new TextEncoder();

/**
 * Compares in constant time. Both values are hashed first so they have the
 * same length, which the comparison requires and which hides the real length.
 */
export async function verifyPassword(candidate: string, expected: string): Promise<boolean> {
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(candidateHash, expectedHash);
}

/** Address the request comes from, as seen by Cloudflare. */
export function getClientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'inconnue';
}

/** Minutes left before a new attempt is allowed from this address; 0 when allowed now. */
export async function getLockoutMinutes(db: D1Database, address: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString();
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS failures, MIN(horodatage) AS oldest FROM tentatives_connexion WHERE ip = ? AND horodatage > ?',
    )
    .bind(address, windowStart)
    .first<{ failures: number; oldest: string | null }>();
  if (!row || !row.oldest || row.failures < MAX_FAILED_ATTEMPTS) return 0;
  const unlockAt = new Date(row.oldest).getTime() + ATTEMPT_WINDOW_MS;
  return Math.max(1, Math.ceil((unlockAt - now.getTime()) / 60_000));
}

/** Remembers a failed attempt and forgets the ones that no longer count. */
export async function recordFailedAttempt(db: D1Database, address: string, now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString();
  await db.batch([
    db.prepare('DELETE FROM tentatives_connexion WHERE horodatage <= ?').bind(windowStart),
    db.prepare('INSERT INTO tentatives_connexion (ip, horodatage) VALUES (?, ?)').bind(address, now.toISOString()),
  ]);
}

export async function clearFailedAttempts(db: D1Database, address: string): Promise<void> {
  await db.prepare('DELETE FROM tentatives_connexion WHERE ip = ?').bind(address).run();
}
