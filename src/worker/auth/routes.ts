/**
 * Login, logout and the guard that protects everything else.
 */
import { jsonError } from '../http';
import { renderLoginPage } from './login-page';
import {
  MIN_PASSWORD_LENGTH,
  clearFailedAttempts,
  getClientAddress,
  getLockoutMinutes,
  recordFailedAttempt,
  verifyPassword,
} from './password';
import { MIN_SECRET_LENGTH, buildLogoutCookie, buildSessionCookie, hasValidSession } from './session';

/** The two secrets, or null when the Worker is not configured (or too weakly). */
function readSecrets(env: Env): { password: string; sessionSecret: string } | null {
  const password = env.BUREAU_PASSWORD ?? '';
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (password.length < MIN_PASSWORD_LENGTH || sessionSecret.length < MIN_SECRET_LENGTH) return null;
  return { password, sessionSecret };
}

const NOT_CONFIGURED =
  `Configuration incomplète : définis BUREAU_PASSWORD (${MIN_PASSWORD_LENGTH} caractères au moins) et ` +
  `SESSION_SECRET (${MIN_SECRET_LENGTH} caractères au moins), dans .dev.vars en local ou avec « wrangler secret put » en ligne.`;

/**
 * Only local paths are accepted as a return address, so the login form
 * cannot be used to bounce a visitor to another site.
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (next === '/login' || next.startsWith('/login?')) return '/';
  return next;
}

/**
 * True when a request that changes something was sent by our own pages.
 * Browsers say where a request comes from; tools without those headers
 * (curl, tests) carry no ambient cookie and are let through.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (origin !== null) return origin === new URL(request.url).origin;
  const site = request.headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin' || site === 'none';
}

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', ...headers } });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secrets = readSecrets(env);

  if (request.method === 'GET') {
    const next = sanitizeNext(url.searchParams.get('next'));
    if (!secrets) return renderLoginPage({ next, error: NOT_CONFIGURED, status: 503 });
    if (await hasValidSession(request, secrets.sessionSecret)) return redirect(next);
    return renderLoginPage({ next });
  }

  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  if (!isSameOrigin(request)) return new Response('Origine refusée', { status: 403 });

  const form = await request.formData().catch(() => null);
  const next = sanitizeNext(form?.get('next')?.toString());
  if (!secrets) return renderLoginPage({ next, error: NOT_CONFIGURED, status: 503 });

  const now = new Date();
  const address = getClientAddress(request);
  const lockedFor = await getLockoutMinutes(env.DB, address, now);
  if (lockedFor > 0) {
    return renderLoginPage({
      next,
      error: `Trop de tentatives. Réessaie dans ${lockedFor} minute${lockedFor > 1 ? 's' : ''}.`,
      status: 429,
    });
  }

  const candidate = form?.get('mot_de_passe')?.toString() ?? '';
  if (!(await verifyPassword(candidate, secrets.password))) {
    await recordFailedAttempt(env.DB, address, now);
    return renderLoginPage({ next, error: 'Mot de passe incorrect.', status: 401 });
  }

  await clearFailedAttempts(env.DB, address);
  return redirect(next, { 'set-cookie': await buildSessionCookie(request, secrets.sessionSecret, now) });
}

export function handleLogout(request: Request): Response {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (!isSameOrigin(request)) return new Response('Origine refusée', { status: 403 });
  return redirect('/login', { 'set-cookie': buildLogoutCookie(request) });
}

/**
 * Guard for every protected route. Returns null when the visitor is logged
 * in, otherwise the response to send: a redirect to the login page for a
 * page, a 401 for the API and the WebSocket.
 */
export async function requireSession(request: Request, env: Env): Promise<Response | null> {
  const secrets = readSecrets(env);
  if (secrets && (await hasValidSession(request, secrets.sessionSecret))) return null;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
    return jsonError(401, 'non_connecte', 'Connexion requise.');
  }
  const next = sanitizeNext(url.pathname + url.search);
  return redirect(next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
}
