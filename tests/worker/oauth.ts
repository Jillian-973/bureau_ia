/**
 * Test helpers that connect to the MCP server the way Claude does: register
 * a client, sign in with the office password, approve the consent page,
 * exchange the code for an access token (PKCE, S256).
 */
import { SELF, env } from 'cloudflare:test';
import { getOAuthApi } from '@cloudflare/workers-oauth-provider';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { oauthOptions } from '../../src/worker/oauth/provider';
import { TEST_ORIGIN, login } from './helpers';

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export const MCP_URL = `${TEST_ORIGIN}/mcp`;

const base64Url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** Collects the `name=value` part of every Set-Cookie header. */
export function cookiesFrom(response: Response): string[] {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '');
}

/** A public client registered in advance, like a "Use your own OAuth client" connector. */
export async function registerTestClient(): Promise<string> {
  const oauth = getOAuthApi(oauthOptions(TEST_ORIGIN), env);
  const client = await oauth.createClient({
    clientName: 'Client de test',
    redirectUris: [CLAUDE_CALLBACK],
    tokenEndpointAuthMethod: 'none',
  });
  return client.clientId;
}

export interface AuthorizationStart {
  clientId: string;
  verifier: string;
  state: string;
  url: string;
}

export async function startAuthorization(clientId: string): Promise<AuthorizationStart> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(12)));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    resource: MCP_URL,
  });
  return { clientId, verifier, state, url: `${TEST_ORIGIN}/authorize?${params}` };
}

/** Opens the consent page with a logged-in session; returns its handle and binding cookies. */
export async function openConsent(start: AuthorizationStart, sessionCookie: string) {
  const response = await SELF.fetch(start.url, { headers: { Cookie: sessionCookie }, redirect: 'manual' });
  const html = await response.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
  return { response, html, handle, cookies: cookiesFrom(response) };
}

export async function postConsent(
  decision: 'approve' | 'deny',
  handle: string,
  cookies: string[],
): Promise<Response> {
  return SELF.fetch(`${TEST_ORIGIN}/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookies.join('; '), Origin: TEST_ORIGIN },
    body: new URLSearchParams({ handle, decision }),
  });
}

export async function exchangeCode(start: AuthorizationStart, code: string): Promise<Response> {
  return SELF.fetch(`${TEST_ORIGIN}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CLAUDE_CALLBACK,
      client_id: start.clientId,
      code_verifier: start.verifier,
      resource: MCP_URL,
    }),
  });
}

/** The whole flow: returns an access token for the MCP endpoint. */
export async function obtainAccessToken(address = '203.0.113.120'): Promise<string> {
  const session = await login(address);
  const start = await startAuthorization(await registerTestClient());
  const consent = await openConsent(start, session);
  if (!consent.handle) throw new Error(`No consent page (status ${consent.response.status})`);
  const approved = await postConsent('approve', consent.handle, [session, ...consent.cookies]);
  const code = new URL(approved.headers.get('location') ?? '').searchParams.get('code');
  if (!code) throw new Error(`No authorization code (status ${approved.status})`);
  const tokens = (await (await exchangeCode(start, code)).json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('No access token');
  return tokens.access_token;
}

/** Official MCP client connected to the Worker under test with a bearer token. */
export async function connectMcpClient(accessToken: string): Promise<Client> {
  const client = new Client({ name: 'tests-bureau', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: (input, init) => SELF.fetch(input as RequestInfo, init),
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  return client;
}
