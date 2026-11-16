import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MAX_FAILED_ATTEMPTS, verifyPassword } from '../../src/worker/auth/password';
import { handleLogin, isSameOrigin, requireSession, sanitizeNext } from '../../src/worker/auth/routes';
import {
  SESSION_COOKIE,
  SESSION_LIFETIME_S,
  createSessionToken,
  verifySessionToken,
} from '../../src/worker/auth/session';
import { TEST_ORIGIN, login, postLogin } from './helpers';

describe('password', () => {
  it('accepts only the exact password', async () => {
    expect(await verifyPassword('correct horse battery', 'correct horse battery')).toBe(true);
    expect(await verifyPassword('correct horse batterx', 'correct horse battery')).toBe(false);
    expect(await verifyPassword('', 'correct horse battery')).toBe(false);
  });
});

describe('session token', () => {
  const secret = 'a-test-secret-that-is-long-enough-123456';
  const now = new Date('2026-11-16T12:00:00Z');

  it('is valid until it expires', async () => {
    const token = await createSessionToken(secret, now);
    expect(await verifySessionToken(token, secret, now)).toBe(true);
    const lastSecond = new Date(now.getTime() + (SESSION_LIFETIME_S - 1) * 1000);
    expect(await verifySessionToken(token, secret, lastSecond)).toBe(true);
    const afterExpiry = new Date(now.getTime() + SESSION_LIFETIME_S * 1000);
    expect(await verifySessionToken(token, secret, afterExpiry)).toBe(false);
  });

  it('is rejected when forged or tampered with', async () => {
    const token = await createSessionToken(secret, now);
    const [expiry, signature] = token.split('.');
    // Pushing the expiry back without the key breaks the signature.
    expect(await verifySessionToken(`${Number(expiry) + 3600}.${signature}`, secret, now)).toBe(false);
    expect(await verifySessionToken(token, 'another-secret-that-is-long-enough-12345', now)).toBe(false);
    for (const garbage of ['', 'abc', '.', `${expiry}.`, `${expiry}.%%%`, `${token}.extra`]) {
      expect(await verifySessionToken(garbage, secret, now)).toBe(false);
    }
  });
});

describe('login', () => {
  it('shows the login page', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/login`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('Mot de passe');
    expect(html).toContain('type="password"');
  });

  it('opens a session with an HttpOnly, Secure, SameSite cookie', async () => {
    const response = await postLogin(env.BUREAU_PASSWORD, '203.0.113.10');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=\\d+\\.[\\w-]+;`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${SESSION_LIFETIME_S}`);
  });

  it('refuses a wrong password without setting a cookie', async () => {
    const response = await postLogin('not-the-password', '203.0.113.11');
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('Mot de passe incorrect');
  });

  it('never echoes the password or a secret back', async () => {
    const response = await postLogin('<script>alert(1)</script>', '203.0.113.12');
    const html = await response.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain(env.BUREAU_PASSWORD);
    expect(html).not.toContain(env.SESSION_SECRET);
  });

  it(`locks an address out after ${MAX_FAILED_ATTEMPTS} failures, even with the right password`, async () => {
    const address = '203.0.113.13';
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      expect((await postLogin('wrong', address)).status).toBe(401);
    }
    const locked = await postLogin(env.BUREAU_PASSWORD, address);
    expect(locked.status).toBe(429);
    expect(locked.headers.get('set-cookie')).toBeNull();
    expect(await locked.text()).toContain('Trop de tentatives');
    // Another address is not affected.
    expect((await postLogin(env.BUREAU_PASSWORD, '203.0.113.14')).status).toBe(303);
  });

  it('forgets earlier failures after a successful login', async () => {
    const address = '203.0.113.15';
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt++) await postLogin('wrong', address);
    expect((await postLogin(env.BUREAU_PASSWORD, address)).status).toBe(303);
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt++) await postLogin('wrong', address);
    expect((await postLogin(env.BUREAU_PASSWORD, address)).status).toBe(303);
  });

  it('refuses a form posted from another site', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: 'https://evil.example', 'CF-Connecting-IP': '203.0.113.16' },
      body: new URLSearchParams({ mot_de_passe: env.BUREAU_PASSWORD }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns to the requested page, but never to another site', async () => {
    const response = await postLogin(env.BUREAU_PASSWORD, '203.0.113.17', '/missions?statut=ouverte');
    expect(response.headers.get('location')).toBe('/missions?statut=ouverte');

    expect(sanitizeNext('/reglages')).toBe('/reglages');
    for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', 'missions', '', null, '/login']) {
      expect(sanitizeNext(unsafe)).toBe('/');
    }
  });

  it('explains what is missing when the secrets are not configured', async () => {
    const request = new Request(`${TEST_ORIGIN}/login`);
    for (const broken of [
      { ...env, BUREAU_PASSWORD: '' },
      { ...env, BUREAU_PASSWORD: 'short' },
      { ...env, SESSION_SECRET: 'too-short' },
    ]) {
      const response = await handleLogin(request, broken);
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('Configuration incomplète');
    }
    // And nothing is reachable in that state.
    const guarded = await requireSession(new Request(`${TEST_ORIGIN}/api/elements/agent`), {
      ...env,
      SESSION_SECRET: '',
    });
    expect(guarded?.status).toBe(401);
  });
});

describe('protected routes', () => {
  it('sends a visitor without session to the login page', async () => {
    const home = await SELF.fetch(`${TEST_ORIGIN}/`, { redirect: 'manual' });
    expect(home.status).toBe(303);
    expect(home.headers.get('location')).toBe('/login');

    const deep = await SELF.fetch(`${TEST_ORIGIN}/assets/app.js?v=1`, { redirect: 'manual' });
    expect(deep.headers.get('location')).toBe(`/login?next=${encodeURIComponent('/assets/app.js?v=1')}`);
  });

  it('answers 401 to the API and the WebSocket without session', async () => {
    const api = await SELF.fetch(`${TEST_ORIGIN}/api/elements/agent`);
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: { code: 'non_connecte', message: 'Connexion requise.' } });

    const socket = await SELF.fetch(`${TEST_ORIGIN}/ws`, { headers: { Upgrade: 'websocket' } });
    expect(socket.status).toBe(401);
    expect(socket.webSocket).toBeNull();
  });

  it('rejects a forged or expired cookie', async () => {
    const expired = await createSessionToken(env.SESSION_SECRET, new Date(Date.now() - (SESSION_LIFETIME_S + 60) * 1000));
    for (const token of ['9999999999.forged', expired]) {
      const response = await SELF.fetch(`${TEST_ORIGIN}/api/elements/agent`, {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(response.status).toBe(401);
    }
  });

  it('lets a logged-in visitor through, then out again', async () => {
    const cookie = await login('203.0.113.18');
    const guarded = await requireSession(new Request(`${TEST_ORIGIN}/`, { headers: { Cookie: cookie } }), env);
    expect(guarded).toBeNull();

    // Already logged in: the login page sends straight back to the office.
    const loginPage = await SELF.fetch(`${TEST_ORIGIN}/login`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(loginPage.status).toBe(303);

    const logout = await SELF.fetch(`${TEST_ORIGIN}/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Cookie: cookie, Origin: TEST_ORIGIN },
    });
    expect(logout.status).toBe(303);
    expect(logout.headers.get('location')).toBe('/login');
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('keeps the health check public and free of details', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/api/health`);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('same-origin check', () => {
  const request = (headers: Record<string, string>) => new Request(`${TEST_ORIGIN}/logout`, { method: 'POST', headers });

  it('trusts our own pages and tools without browser headers', () => {
    expect(isSameOrigin(request({ Origin: TEST_ORIGIN }))).toBe(true);
    expect(isSameOrigin(request({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
    expect(isSameOrigin(request({}))).toBe(true);
  });

  it('refuses other sites', () => {
    expect(isSameOrigin(request({ Origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOrigin(request({ Origin: 'null' }))).toBe(false);
    expect(isSameOrigin(request({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
  });
});
