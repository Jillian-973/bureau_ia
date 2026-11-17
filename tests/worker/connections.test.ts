import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TEST_ORIGIN, login } from './helpers';
import { MCP_URL, connectMcpClient, exchangeCode, openConsent, postConsent, startAuthorization } from './oauth';

const INSPECTOR_CALLBACK = 'http://localhost:6274/oauth/callback';

async function postForm(cookie: string, fields: Record<string, string>): Promise<Response> {
  return SELF.fetch(`${TEST_ORIGIN}/connexions`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: TEST_ORIGIN },
    body: new URLSearchParams(fields),
  });
}

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const response = await SELF.fetch(`${TEST_ORIGIN}/api${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: TEST_ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as { data?: any; error?: { code: string; message: string } } };
}

describe('connections page', () => {
  it('is behind the office password', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/connexions`, { redirect: 'manual' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/login?next=${encodeURIComponent('/connexions')}`);
  });

  it('shows the connector address and offers a client for MCP Inspector', async () => {
    const cookie = await login('203.0.113.160');
    const html = await (await SELF.fetch(`${TEST_ORIGIN}/connexions`, { headers: { Cookie: cookie } })).text();
    expect(html).toContain(MCP_URL);
    expect(html).toContain(INSPECTOR_CALLBACK);
  });

  it('registers a client that can then connect, and shows the connection', async () => {
    const cookie = await login('203.0.113.161');
    const created = await postForm(cookie, { action: 'creer_client', nom: 'Inspecteur', adresse_retour: 'https://claude.ai/api/mcp/auth_callback' });
    const html = await created.text();
    expect(html).toContain('Client créé');
    const clientId = /Identifiant à coller dans l'outil : <code>([^<]+)<\/code>/.exec(html)?.[1];
    expect(clientId).toBeTruthy();

    // The new client goes through the whole OAuth flow.
    const start = await startAuthorization(clientId!);
    const consent = await openConsent(start, cookie);
    expect(consent.html).toContain('Inspecteur');
    const approved = await postConsent('approve', consent.handle!, [cookie, ...consent.cookies]);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
    const { access_token } = (await (await exchangeCode(start, code)).json()) as { access_token: string };
    const client = await connectMcpClient(access_token);
    expect((await client.listTools()).tools.length).toBe(14);

    const page = await (await SELF.fetch(`${TEST_ORIGIN}/connexions`, { headers: { Cookie: cookie } })).text();
    expect(page).toContain('Applications connectées');
    expect(page).toContain('Déconnecter');
  });

  it('refuses an unsafe return address', async () => {
    const cookie = await login('203.0.113.162');
    for (const address of ['http://evil.example/cb', 'javascript:alert(1)', 'https://ok.example/cb#frag', 'pas une adresse']) {
      const response = await postForm(cookie, { action: 'creer_client', nom: 'Douteux', adresse_retour: address });
      expect(response.status, address).toBe(400);
      expect(await response.text()).toContain('Adresse de retour attendue');
    }
  });

  it('refuses a form posted from another site', async () => {
    const cookie = await login('203.0.113.163');
    const response = await SELF.fetch(`${TEST_ORIGIN}/connexions`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example' },
      body: new URLSearchParams({ action: 'creer_client', nom: 'Pirate', adresse_retour: 'https://evil.example/cb' }),
    });
    expect(response.status).toBe(403);
  });
});

describe('connections API', () => {
  it('creates, lists and deletes a pre-registered client', async () => {
    const cookie = await login('203.0.113.170');
    const created = await api(cookie, 'POST', '/clients-oauth', { nom: 'Outil local', adresse_retour: INSPECTOR_CALLBACK });
    expect(created.status).toBe(201);
    const clientId = created.body.data.client_id as string;

    const listed = await api(cookie, 'GET', '/clients-oauth');
    expect(listed.body.data).toContainEqual(expect.objectContaining({ client_id: clientId, nom: 'Outil local' }));

    expect((await api(cookie, 'DELETE', `/clients-oauth/${clientId}`)).status).toBe(200);
    expect((await api(cookie, 'DELETE', `/clients-oauth/${clientId}`)).status).toBe(404);
  });

  it('disconnects an application: its token stops working', async () => {
    const cookie = await login('203.0.113.171');
    const created = await api(cookie, 'POST', '/clients-oauth', { nom: 'À couper', adresse_retour: 'https://claude.ai/api/mcp/auth_callback' });
    const start = await startAuthorization(created.body.data.client_id);
    const consent = await openConsent(start, cookie);
    const approved = await postConsent('approve', consent.handle!, [cookie, ...consent.cookies]);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
    const { access_token } = (await (await exchangeCode(start, code)).json()) as { access_token: string };

    const grants = (await api(cookie, 'GET', '/acces')).body.data as Array<{ id: string; client_id: string }>;
    const grant = grants.find((item) => item.client_id === created.body.data.client_id);
    expect(grant).toBeDefined();
    expect((await api(cookie, 'DELETE', `/acces/${grant!.id}`)).status).toBe(200);

    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });
});
