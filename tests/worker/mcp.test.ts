import { SELF, env } from 'cloudflare:test';
import type { Client } from '@modelcontextprotocol/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ElementRecord } from '../../src/shared/schemas/elements';
import { TOOL_DESCRIPTION_PREFIX } from '../../src/worker/mcp/trigger';
import { TEST_ORIGIN, countRows, login } from './helpers';
import { connectMcpClient, obtainAccessToken } from './oauth';

const TOOL_NAMES = [
  'bureau_lire',
  'bureau_creer',
  'bureau_modifier',
  'bureau_supprimer',
  'bureau_restaurer',
  'historique_annuler',
  'bureau_afficher',
  'mission_ouvrir',
  'mission_cloturer',
  'tache_deleguer',
  'tache_resultat',
  'agent_modifier_fonction',
  'agent_creer_sous_agent',
  'budget_etat',
];

let client: Client;

beforeAll(async () => {
  client = await connectMcpClient(await obtainAccessToken('203.0.113.140'));
});

interface ToolAnswer {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
}

/** Calls a tool and decodes its compact JSON answer. */
async function call(name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  const text = first?.type === 'text' ? (first.text ?? '') : '';
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Error messages are plain text.
  }
  return { isError: result.isError === true, text, data };
}

describe('tool catalogue', () => {
  it('exposes exactly the fourteen tools of the specification', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('starts every description with the trigger rule and requires the trigger', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description?.startsWith(TOOL_DESCRIPTION_PREFIX), tool.name).toBe(true);
      expect(tool.inputSchema.required, tool.name).toContain('declencheur');
      expect((tool.inputSchema.properties as Record<string, { enum?: string[] }>).declencheur?.enum).toEqual([
        '@bureau',
        '/bureau',
      ]);
    }
  });

  it('marks reading tools as read-only and deletion as destructive', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ['bureau_lire', 'bureau_afficher', 'tache_resultat', 'budget_etat']) {
      expect(byName.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
    expect(byName.get('bureau_supprimer')?.annotations?.destructiveHint).toBe(true);
  });

  it('states the trigger rule in the server instructions', () => {
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('@bureau');
    expect(instructions).toContain('/bureau');
    expect(instructions).toContain("n'utilise aucun outil");
  });

  it('offers a "bureau" prompt that turns a request into a /bureau message', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain('bureau');
    const alone = await client.getPrompt({ name: 'bureau', arguments: {} });
    expect(alone.messages[0]?.content).toEqual({ type: 'text', text: '/bureau' });
    const withRequest = await client.getPrompt({ name: 'bureau', arguments: { demande: 'fais une recherche sur X' } });
    expect(withRequest.messages[0]?.content).toEqual({ type: 'text', text: '/bureau fais une recherche sur X' });
  });
});

describe('trigger', () => {
  it('refuses a call without a valid trigger, with a message that recalls the rule', async () => {
    const before = await countRows('events');
    for (const args of [
      { type: 'agent' },
      { type: 'agent', declencheur: '' },
      { type: 'agent', declencheur: 'bonjour' },
      { type: 'agent', declencheur: '@Bureau' },
    ]) {
      const answer = await call('bureau_lire', args);
      expect(answer.isError).toBe(true);
      expect(answer.text).toContain('Appel refusé');
      expect(answer.text).toContain('@bureau');
    }
    const write = await call('mission_ouvrir', { titre: 'Sans déclencheur', type: 'perso' });
    expect(write.isError).toBe(true);
    expect(await countRows('events')).toBe(before);
    expect(await countRows('missions', "titre = 'Sans déclencheur'")).toBe(0);
  });

  it('journals every accepted call with its trigger', async () => {
    const before = await countRows('appels_mcp');
    await call('budget_etat', { declencheur: '@bureau' });
    await call('bureau_lire', { declencheur: '/bureau', type: 'agent', id: 'agent-inconnu' });
    const { results } = await env.DB.prepare('SELECT outil, declencheur, succes, erreur FROM appels_mcp ORDER BY id DESC LIMIT 2').all();
    expect(await countRows('appels_mcp')).toBe(before + 2);
    expect(results[1]).toMatchObject({ outil: 'budget_etat', declencheur: '@bureau', succes: 1, erreur: null });
    expect(results[0]).toMatchObject({ outil: 'bureau_lire', declencheur: '/bureau', succes: 0 });
    expect(String(results[0]?.erreur)).toContain('introuvable');
  });
});

describe('the chef at work', () => {
  it('"/bureau" alone shows the office with a link to the web page', async () => {
    const answer = await call('bureau_afficher', { declencheur: '/bureau' });
    expect(answer.isError).toBe(false);
    expect((answer.data.agents as ElementRecord[]).map((agent) => agent.nom)).toContain('Chercheur');
    expect((answer.data.salles as ElementRecord[]).length).toBeGreaterThanOrEqual(6);
    expect(answer.data.page_web).toBe(`${TEST_ORIGIN}/`);
  });

  it('opens a mission, delegates to the researcher and reads the task back', async () => {
    const mission = await call('mission_ouvrir', {
      declencheur: '@bureau',
      titre: 'Recherche sur X',
      type: 'recherche',
      brief: 'Faire le point sur X',
    });
    const missionId = String(mission.data.mission_id);
    expect(missionId).toMatch(/^mission-/);

    const task = await call('tache_deleguer', {
      declencheur: '@bureau',
      mission_id: missionId,
      agent_id: 'agent-chercheur',
      brief: 'Synthèse des sources sur X',
      format_retour: 'Liste à puces',
    });
    expect(task.isError).toBe(false);
    expect(task.data.statut).toBe('en_attente');

    const result = await call('tache_resultat', { declencheur: '@bureau', tache_id: task.data.tache_id, complet: true });
    expect(result.data).toMatchObject({ statut: 'en_attente', agent_id: 'agent-chercheur' });
    expect(result.data.livrable_complet).toEqual(expect.any(String));

    const stored = await env.DB.prepare('SELECT brief FROM taches WHERE id = ?').bind(task.data.tache_id).first<{ brief: string }>();
    expect(stored?.brief).toContain('Format de retour : Liste à puces');

    const closed = await call('mission_cloturer', { declencheur: '@bureau', mission_id: missionId, bilan: 'Synthèse livrée' });
    expect(closed.data.apres).toMatchObject({ statut: 'cloturee', bilan: 'Synthèse livrée' });
  });

  it('never sends a private task to the free Gemini tier', async () => {
    const mission = await call('mission_ouvrir', { declencheur: '@bureau', titre: 'Dossier perso', type: 'perso' });
    const refused = await call('tache_deleguer', {
      declencheur: '@bureau',
      mission_id: mission.data.mission_id,
      agent_id: 'agent-redacteur',
      brief: 'Rédige ma lettre',
      privee: true,
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('Gemini');
    expect(await countRows('taches', `mission_id = '${String(mission.data.mission_id)}'`)).toBe(0);

    // DeepSeek only once allowed in the settings and by the agent.
    const deepseek = { declencheur: '@bureau', mission_id: mission.data.mission_id, agent_id: 'agent-technicien', brief: 'Script privé', privee: true };
    expect((await call('tache_deleguer', deepseek)).text).toContain('prive_vers_deepseek');
    await call('bureau_modifier', { declencheur: '@bureau', type: 'reglage', id: 'prive_vers_deepseek', correctif: { valeur: true } });
    expect((await call('tache_deleguer', deepseek)).text).toContain('accepte_prive');
    await call('bureau_modifier', { declencheur: '@bureau', type: 'agent', id: 'agent-technicien', correctif: { accepte_prive: true } });
    expect((await call('tache_deleguer', deepseek)).isError).toBe(false);

    // The chef can always keep it.
    const chef = await call('tache_deleguer', { ...deepseek, agent_id: 'agent-chef' });
    expect(chef.isError).toBe(false);
  });

  it('renames an agent and changes its role; the web page sees it (acceptance criterion 2)', async () => {
    const renamed = await call('bureau_modifier', {
      declencheur: '@bureau',
      type: 'agent',
      id: 'agent-chercheur',
      correctif: { nom: 'Enquêteur' },
    });
    expect(renamed.data).toMatchObject({ avant: { nom: 'Chercheur' }, apres: { nom: 'Enquêteur' } });

    const role = await call('agent_modifier_fonction', {
      declencheur: '@bureau',
      agent_id: 'agent-chercheur',
      fonction: 'Veille et recherche approfondie',
    });
    expect(role.data.version).toBe(2);

    const cookie = await login('203.0.113.141');
    const page = (await (await SELF.fetch(`${TEST_ORIGIN}/api/elements/agent/agent-chercheur`, { headers: { Cookie: cookie } })).json()) as {
      data: ElementRecord;
    };
    expect(page.data).toMatchObject({ nom: 'Enquêteur', fonction: 'Veille et recherche approfondie' });
    const journal = (await (await SELF.fetch(`${TEST_ORIGIN}/api/events?type_cible=agent&id_cible=agent-chercheur&limite=1`, { headers: { Cookie: cookie } })).json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(journal.data[0]).toMatchObject({ auteur: 'chef', declencheur: '@bureau' });
  });

  it('sees what the user changed by hand (acceptance criterion 3)', async () => {
    const cookie = await login('203.0.113.142');
    await SELF.fetch(`${TEST_ORIGIN}/api/elements/agent/agent-redacteur`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: TEST_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ pseudo: 'Colette' }),
    });
    const read = await call('bureau_lire', { declencheur: '@bureau', type: 'agent', id: 'agent-redacteur' });
    expect(read.data.pseudo).toBe('Colette');
  });

  it('undoes any change from its event (acceptance criterion 4)', async () => {
    const changed = await call('bureau_modifier', { declencheur: '@bureau', type: 'theme', correctif: { valeur: 'aube' } });
    const history = await call('bureau_lire', { declencheur: '@bureau', type: 'historique', id: 'theme', limite: 1 });
    expect((history as unknown as { data: unknown }).data).toEqual([expect.objectContaining({ id: changed.data.evenement, cible: 'reglage:theme' })]);

    const undone = await call('historique_annuler', { declencheur: '@bureau', evenement_id: changed.data.evenement });
    expect(undone.data.apres).toEqual({ valeur: 'nuit' });
    expect((await call('bureau_lire', { declencheur: '@bureau', type: 'theme' })).data).toEqual({ theme: 'nuit' });
  });

  it('creates a sub-agent with the provider of its parent and its own avatar', async () => {
    const created = await call('agent_creer_sous_agent', {
      declencheur: '@bureau',
      parent_id: 'agent-technicien',
      nom: 'Testeur',
      fonction: 'Écrit les tests',
    });
    expect(created.data.fournisseur).toBe('deepseek');
    const agent = await call('bureau_lire', { declencheur: '@bureau', type: 'agent', id: created.data.agent_id });
    expect(agent.data).toMatchObject({ parent_id: 'agent-technicien', avatar_id: created.data.avatar_id });
  });

  it('trashes, restores, then deletes for good only with the token', async () => {
    const room = await call('bureau_creer', {
      declencheur: '@bureau',
      type: 'salle',
      donnees: { type: 'pause', nom: 'Cabane', position_x: 80, position_y: 0, largeur: 4, profondeur: 4 },
    });
    const roomId = String((room.data.cree as ElementRecord).id);

    expect((await call('bureau_supprimer', { declencheur: '@bureau', type: 'salle', id: roomId, definitif: true })).text).toContain(
      'corbeille',
    );
    expect((await call('bureau_supprimer', { declencheur: '@bureau', type: 'salle', id: roomId })).data.corbeille).toBe(`salle:${roomId}`);
    await call('bureau_restaurer', { declencheur: '@bureau', type: 'salle', id: roomId });
    await call('bureau_supprimer', { declencheur: '@bureau', type: 'salle', id: roomId });

    const request = await call('bureau_supprimer', { declencheur: '@bureau', type: 'salle', id: roomId, definitif: true });
    expect(request.data.jeton).toEqual(expect.any(String));
    expect(await countRows('salles', `id = '${roomId}'`)).toBe(1);

    const confirmed = await call('bureau_supprimer', { declencheur: '@bureau', type: 'salle', id: roomId, jeton: request.data.jeton });
    expect(confirmed.data.supprime_definitivement).toBe(`salle:${roomId}`);
    expect(await countRows('salles', `id = '${roomId}'`)).toBe(0);
  });

  it('reports the budget of the month', async () => {
    await call('bureau_modifier', { declencheur: '@bureau', type: 'reglage', id: 'plafond_mensuel_deepseek', correctif: { valeur: 5 } });
    const budget = await call('budget_etat', { declencheur: '@bureau' });
    expect(budget.data.mois).toMatch(/^\d{4}-\d{2}$/);
    expect(budget.data.fournisseurs).toContainEqual({ fournisseur: 'deepseek', depense: 0, plafond: 5, restant: 5 });
  });

  it('keeps answers compact', async () => {
    const list = await call('bureau_lire', { declencheur: '@bureau', type: 'meuble', limite: 50 });
    const rows = list.data as unknown as ElementRecord[];
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row).not.toHaveProperty('modifie_le');
      expect(row).not.toHaveProperty('cree_le');
      expect(Object.values(row)).not.toContain(null);
    }
    expect(list.text.length / rows.length).toBeLessThan(160);
  });

  it('never returns a secret', async () => {
    for (const [name, args] of [
      ['bureau_lire', { type: 'reglage' }],
      ['bureau_lire', { type: 'historique', limite: 200 }],
      ['bureau_afficher', {}],
      ['budget_etat', {}],
    ] as const) {
      const answer = await call(name, { declencheur: '@bureau', ...args });
      expect(answer.text).not.toContain(env.BUREAU_PASSWORD);
      expect(answer.text).not.toContain(env.SESSION_SECRET);
    }
  });
});
