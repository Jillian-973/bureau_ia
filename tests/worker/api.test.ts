import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ElementRecord } from '../../src/shared/schemas/elements';
import type { BureauEvent, RealtimeMessage } from '../../src/shared/schemas/events';
import { createLiveContext } from '../../src/worker/realtime';
import { readElement, updateElement } from '../../src/worker/services/elements';
import { TEST_ORIGIN, countRows, login } from './helpers';

/** One login for the whole file. */
const sessionCookie = login('203.0.113.80');

interface ApiBody {
  data?: unknown;
  event?: BureauEvent | null;
  error?: { code: string; message: string };
}

/** Calls the API like the web page does: same origin, session cookie, JSON. */
async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await SELF.fetch(`${TEST_ORIGIN}/api${path}`, {
    method,
    headers: {
      Cookie: await sessionCookie,
      Origin: TEST_ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as ApiBody };
}

const element = (body: ApiBody) => body.data as ElementRecord;

describe('REST API: reading', () => {
  it('confirms the session', async () => {
    expect(await api('GET', '/session')).toEqual({ status: 200, body: { data: { connecte: true } } });
  });

  it('lists and reads elements', async () => {
    const list = await api('GET', '/elements/agent?fournisseur=deepseek');
    expect((list.body.data as ElementRecord[]).map((agent) => agent.id).sort()).toEqual([
      'agent-developpeur',
      'agent-technicien',
    ]);
    const one = await api('GET', '/elements/salle/salle-cafeteria');
    expect(element(one.body)).toMatchObject({ nom: 'Cafétéria', type: 'cafeteria' });
  });

  it('serves the furniture catalogue and the versions of an agent', async () => {
    const catalogue = await api('GET', '/catalogue');
    const models = catalogue.body.data as ElementRecord[];
    expect(models.length).toBeGreaterThanOrEqual(10);
    expect(models.every((model) => (model.variantes as string[]).length >= 3)).toBe(true);

    const versions = await api('GET', '/agents/agent-chef/versions');
    expect((versions.body.data as ElementRecord[])[0]).toMatchObject({ version: 1, auteur: 'systeme' });
  });

  it('serves the office overview and the budget, like the chef sees them', async () => {
    const overview = (await api('GET', '/apercu')).body.data as { agents: unknown[]; salles: unknown[] };
    expect(overview.agents).toHaveLength(5);
    expect(overview.salles.length).toBeGreaterThanOrEqual(6);
    const budget = (await api('GET', '/budget')).body.data as { mois: string; fournisseurs: unknown[] };
    expect(budget.mois).toMatch(/^\d{4}-\d{2}$/);
    expect(budget.fournisseurs).toHaveLength(2);
  });

  it('never exposes a secret', async () => {
    for (const path of ['/elements/reglage', '/elements/agent', '/events?limite=200', '/session', '/apercu', '/budget']) {
      const text = JSON.stringify((await api('GET', path)).body);
      expect(text).not.toContain(env.BUREAU_PASSWORD);
      expect(text).not.toContain(env.SESSION_SECRET);
    }
  });

  it('answers clear errors', async () => {
    expect(await api('GET', '/elements/agent/agent-inconnu')).toMatchObject({
      status: 404,
      body: { error: { code: 'introuvable' } },
    });
    expect(await api('GET', '/elements/licorne')).toMatchObject({ status: 400, body: { error: { code: 'validation' } } });
    expect(await api('GET', '/elements/agent?couleur=bleu')).toMatchObject({ status: 400 });
    expect(await api('GET', '/nulle-part')).toMatchObject({ status: 404 });
    expect(await api('PUT', '/elements/agent/agent-chef', {})).toMatchObject({ status: 405 });
  });
});

describe('REST API: changing', () => {
  it('runs the whole life of an element: create, change, trash, restore, undo', async () => {
    const created = await api('POST', '/elements/mission', { titre: 'Refonte du site', type: 'conception' });
    expect(created.status).toBe(201);
    const id = String(element(created.body).id);
    expect(created.body.event).toMatchObject({ type: 'creation', auteur: 'utilisateur', declencheur: null });

    const changed = await api('PATCH', `/elements/mission/${id}`, { brief: 'Page d’accueil et contact' });
    expect(element(changed.body).brief).toBe('Page d’accueil et contact');

    const trashed = await api('DELETE', `/elements/mission/${id}`);
    expect(trashed.body.event).toMatchObject({ type: 'suppression' });
    expect((await api('GET', `/elements/mission/${id}`)).status).toBe(404);
    expect((await api('GET', `/elements/mission/${id}?corbeille=1`)).status).toBe(200);
    const trash = await api('GET', '/elements/mission?corbeille=1');
    expect((trash.body.data as ElementRecord[]).map((mission) => mission.id)).toContain(id);

    const restored = await api('POST', `/elements/mission/${id}/restore`);
    expect(element(restored.body).supprime_le).toBeNull();

    const undone = await api('POST', `/events/${changed.body.event!.id}/undo`);
    expect(element(undone.body).brief).toBe('');
    expect(undone.body.event).toMatchObject({ type: 'annulation' });

    const history = await api('GET', `/events?type_cible=mission&id_cible=${id}`);
    expect((history.body.data as BureauEvent[]).map((event) => event.type)).toEqual([
      'annulation',
      'restauration',
      'suppression',
      'modification',
      'creation',
    ]);
  });

  it('deletes for good only with the single-use token', async () => {
    const created = await api('POST', '/elements/mission', { titre: 'Brouillon', type: 'perso' });
    const id = String(element(created.body).id);

    // Only what is in the trash can be deleted for good.
    expect((await api('POST', `/elements/mission/${id}/purge`)).status).toBe(409);
    await api('DELETE', `/elements/mission/${id}`);

    const request = await api('POST', `/elements/mission/${id}/purge`);
    const { jeton } = request.body.data as { jeton: string };
    expect(await countRows('missions', `id = '${id}'`)).toBe(1);

    expect((await api('POST', '/purge/confirm', { jeton: 'faux' })).body.error?.code).toBe('jeton_invalide');
    expect((await api('POST', '/purge/confirm', {})).status).toBe(400);
    const confirmed = await api('POST', '/purge/confirm', { jeton });
    expect(confirmed.body.event).toMatchObject({ type: 'suppression_definitive', id_cible: id });
    expect(await countRows('missions', `id = '${id}'`)).toBe(0);
    expect((await api('POST', '/purge/confirm', { jeton })).body.error?.code).toBe('jeton_invalide');
  });

  it('returns validation messages in French', async () => {
    const response = await api('POST', '/elements/salle', { type: 'grenier', nom: 'Grenier' });
    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('validation');
    expect(response.body.error?.message).toMatch(/type/);
  });

  it('refuses a change that does not come from the office pages', async () => {
    const before = await countRows('events');
    const crossSite = await api('PATCH', '/elements/agent/agent-chef', { pseudo: 'Pirate' }, { Origin: 'https://evil.example' });
    expect(crossSite).toMatchObject({ status: 403, body: { error: { code: 'origine_refusee' } } });

    // A plain HTML form cannot send JSON: other content types are refused too.
    const form = await SELF.fetch(`${TEST_ORIGIN}/api/elements/agent/agent-chef`, {
      method: 'PATCH',
      headers: { Cookie: await sessionCookie, Origin: TEST_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ pseudo: 'Pirate' }),
    });
    expect(form.status).toBe(400);
    expect(await countRows('events')).toBe(before);
    expect((await readElement(createLiveContext(env, { auteur: 'systeme' }), 'agent', 'agent-chef')).pseudo).toBeNull();
  });

  it('refuses malformed JSON', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/api/elements/mission`, {
      method: 'POST',
      headers: { Cookie: await sessionCookie, Origin: TEST_ORIGIN, 'content-type': 'application/json' },
      body: '{ titre: ',
    });
    expect(response.status).toBe(400);
  });
});

describe('parity between the web page and the chef', () => {
  it('shows the chef what the user changed by hand, and the other way round', async () => {
    // By hand, through the API…
    await api('PATCH', '/elements/agent/agent-redacteur', { pseudo: 'Colette' });
    // …then the chef reads it through the service layer (what MCP tools will call).
    const chef = createLiveContext(env, { auteur: 'chef', declencheur: '@bureau' });
    expect((await readElement(chef, 'agent', 'agent-redacteur')).pseudo).toBe('Colette');

    // The chef renames the agent and changes its role…
    await updateElement(chef, 'agent', 'agent-redacteur', { nom: 'Plume', fonction: 'Rédaction web' });
    // …and the web page sees it, with the author and the trigger in the journal.
    const seen = await api('GET', '/elements/agent/agent-redacteur');
    expect(element(seen.body)).toMatchObject({ nom: 'Plume', fonction: 'Rédaction web', pseudo: 'Colette' });
    const journal = await api('GET', '/events?type_cible=agent&id_cible=agent-redacteur&limite=1');
    expect((journal.body.data as BureauEvent[])[0]).toMatchObject({ auteur: 'chef', declencheur: '@bureau' });
  });

  it('pushes a change made through the API to an open view', async () => {
    const response = await SELF.fetch(`${TEST_ORIGIN}/ws`, {
      headers: { Upgrade: 'websocket', Cookie: await sessionCookie },
    });
    const socket = response.webSocket!;
    const received = new Promise<RealtimeMessage>((resolve) => {
      socket.addEventListener('message', (message) => {
        const parsed = JSON.parse(message.data as string) as RealtimeMessage;
        if (parsed.type === 'evenement') resolve(parsed);
      });
    });
    socket.accept();

    const changed = await api('PATCH', '/elements/reglage/theme', { valeur: 'aurore' });
    expect(await received).toEqual({ type: 'evenement', evenement: changed.body.event });
    socket.close(1000, 'done');
  });
});
