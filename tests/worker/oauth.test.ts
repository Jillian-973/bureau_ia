import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TEST_ORIGIN, login } from './helpers';
import {
  CLAUDE_CALLBACK,
  MCP_URL,
  exchangeCode,
  obtainAccessToken,
  openConsent,
  postConsent,
  registerTestClient,
  startAuthorization,
} from './oauth';

describe('OAuth discovery', () => {
  it('answers an unauthenticated MCP request with a challenge pointing to the metadata', async () => {
    const response = await SELF.fetch(MCP_URL, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${TEST_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it('publishes the protected resource metadata', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/.well-known/oauth-protected-resource/mcp`);
    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata).toMatchObject({ resource: MCP_URL, authorization_servers: [TEST_ORIGIN] });
  });

  it('publishes the authorization server metadata, with CIMD and without dynamic registration', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/.well-known/oauth-authorization-server`);
    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      issuer: TEST_ORIGIN,
      authorization_endpoint: `${TEST_ORIGIN}/authorize`,
      token_endpoint: `${TEST_ORIGIN}/oauth/token`,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ['S256'],
    });
    expect(metadata.registration_endpoint).toBeUndefined();
  });
});

describe('authorization flow', () => {
  it('asks for the office password before anything else', async () => {
    const start = await startAuthorization(await registerTestClient());
    const response = await SELF.fetch(start.url, { redirect: 'manual' });
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location.startsWith('/login?next=')).toBe(true);
    // After login, the user comes back to the same authorization request.
    expect(decodeURIComponent(location.slice('/login?next='.length))).toBe(start.url.slice(TEST_ORIGIN.length));
  });

  it('shows who asks and where the access goes, then delivers a working token', async () => {
    const session = await login('203.0.113.121');
    const start = await startAuthorization(await registerTestClient());
    const consent = await openConsent(start, session);
    expect(consent.response.status).toBe(200);
    expect(consent.html).toContain('Client de test');
    expect(consent.html).toContain('claude.ai');
    expect(consent.response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

    const approved = await postConsent('approve', consent.handle!, [session, ...consent.cookies]);
    expect(approved.status).toBe(302);
    const redirect = new URL(approved.headers.get('location') ?? '');
    expect(`${redirect.origin}${redirect.pathname}`).toBe(CLAUDE_CALLBACK);
    expect(redirect.searchParams.get('state')).toBe(start.state);
    expect(redirect.searchParams.get('iss')).toBe(TEST_ORIGIN);

    const tokenResponse = await exchangeCode(start, redirect.searchParams.get('code')!);
    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as Record<string, unknown>;
    expect(tokens).toMatchObject({ token_type: expect.stringMatching(/^bearer$/i), resource: MCP_URL });
    expect(tokens.access_token).toEqual(expect.any(String));
    expect(tokens.refresh_token).toEqual(expect.any(String));

    // A code works once.
    expect((await exchangeCode(start, redirect.searchParams.get('code')!)).status).toBe(400);
  });

  it('sends the refusal back to the client', async () => {
    const session = await login('203.0.113.122');
    const start = await startAuthorization(await registerTestClient());
    const consent = await openConsent(start, session);
    const denied = await postConsent('deny', consent.handle!, [session, ...consent.cookies]);
    const redirect = new URL(denied.headers.get('location') ?? '');
    expect(redirect.searchParams.get('error')).toBe('access_denied');
    expect(redirect.searchParams.get('state')).toBe(start.state);
  });

  it('refuses a consent form without the browser binding cookie', async () => {
    const session = await login('203.0.113.123');
    const start = await startAuthorization(await registerTestClient());
    const consent = await openConsent(start, session);
    const forged = await postConsent('approve', consent.handle!, [session]);
    expect(forged.status).toBe(400);
    expect(forged.headers.get('location')).toBeNull();
  });

  it('never redirects to an address the client did not register', async () => {
    const session = await login('203.0.113.124');
    const start = await startAuthorization(await registerTestClient());
    const url = start.url.replace(encodeURIComponent(CLAUDE_CALLBACK), encodeURIComponent('https://evil.example/cb'));
    const response = await SELF.fetch(url, { headers: { Cookie: session }, redirect: 'manual' });
    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('Connexion impossible');
  });

  it('rejects a token on the MCP endpoint once it is tampered with', async () => {
    const token = await obtainAccessToken('203.0.113.125');
    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}x`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });
});
