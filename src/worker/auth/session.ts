/**
 * Session of the web page: a signed cookie set after the password was
 * accepted. The cookie only carries an expiry date and its signature
 * (HMAC-SHA256 with the SESSION_SECRET), so there is nothing to store.
 */

export const SESSION_COOKIE = 'bureau_session';
export const SESSION_LIFETIME_S = 7 * 24 * 60 * 60;
/** A shorter signing key is refused. */
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

const payloadOf = (expiresAt: number) => encoder.encode(`bureau-session:${expiresAt}`);

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Builds the session token: `<expiry in seconds>.<signature>`. */
export async function createSessionToken(secret: string, now: Date): Promise<string> {
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_LIFETIME_S;
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), payloadOf(expiresAt));
  return `${expiresAt}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string, secret: string, now: Date): Promise<boolean> {
  const [expiry, signature, ...rest] = token.split('.');
  if (!expiry || !signature || rest.length > 0 || !/^\d{1,12}$/.test(expiry)) return false;
  const expiresAt = Number(expiry);
  if (expiresAt * 1000 <= now.getTime()) return false;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return false;
  return crypto.subtle.verify('HMAC', await importKey(secret), signatureBytes, payloadOf(expiresAt));
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

/** HttpOnly, SameSite and, over HTTPS, Secure. Plain HTTP only happens in local development. */
function cookieAttributes(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function hasValidSession(request: Request, secret: string, now = new Date()): Promise<boolean> {
  const token = readCookie(request, SESSION_COOKIE);
  return token !== null && verifySessionToken(token, secret, now);
}

/** `Set-Cookie` value that opens a session. */
export async function buildSessionCookie(request: Request, secret: string, now = new Date()): Promise<string> {
  const token = await createSessionToken(secret, now);
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_LIFETIME_S}; ${cookieAttributes(request)}`;
}

/** `Set-Cookie` value that closes the session. */
export function buildLogoutCookie(request: Request): string {
  return `${SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(request)}`;
}
