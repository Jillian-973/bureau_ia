import { describe, expect, it } from 'vitest';
import {
  createElement,
  deleteElement,
  listElements,
  readElement,
  restoreElement,
  updateElement,
} from '../../src/worker/services/elements';
import { listEvents } from '../../src/worker/services/events';
import { countRows, createTestContext } from './helpers';

describe('reading elements', () => {
  it('reads one element with booleans and JSON decoded', async () => {
    const { ctx } = createTestContext();
    const chef = await readElement(ctx, 'agent', 'agent-chef');
    expect(chef).toMatchObject({ nom: 'Chef', fournisseur: 'claude', accepte_prive: true });
    const avatar = await readElement(ctx, 'avatar', 'avatar-chef');
    expect(avatar.couleurs).toMatchObject({ peau: '#f2c9a0' });
  });

  it('lists with filters and refuses unknown ones', async () => {
    const { ctx } = createTestContext();
    const gemini = await listElements(ctx, 'agent', { filters: { fournisseur: 'gemini' } });
    expect(gemini.map((agent) => agent.id).sort()).toEqual(['agent-chercheur', 'agent-redacteur']);
    await expect(listElements(ctx, 'agent', { filters: { nom: 'x' } })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('reads settings by key, including unset ones', async () => {
    const { ctx } = createTestContext();
    expect((await readElement(ctx, 'reglage', 'nom_bureau')).valeur).toBe('Bureau');
    expect((await readElement(ctx, 'reglage', 'plafond_par_mission')).valeur).toBeNull();
  });

  it('fails clearly on an unknown element or type', async () => {
    const { ctx } = createTestContext();
    await expect(readElement(ctx, 'agent', 'agent-inconnu')).rejects.toMatchObject({
      code: 'introuvable',
      status: 404,
    });
    await expect(readElement(ctx, 'licorne' as never, 'x')).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('creating elements', () => {
  it('creates, journals and broadcasts', async () => {
    const { ctx, broadcasts } = createTestContext({ auteur: 'chef', declencheur: '@bureau' });
    const { element, event } = await createElement(ctx, 'mission', {
      titre: 'Étude de marché',
      type: 'recherche',
    });

    expect(element).toMatchObject({ titre: 'Étude de marché', statut: 'ouverte', brief: '', supprime_le: null });
    expect(String(element.id)).toMatch(/^mission-[a-z0-9]{8}$/);
    expect(await readElement(ctx, 'mission', String(element.id))).toEqual(element);

    expect(event).toMatchObject({
      type: 'creation',
      auteur: 'chef',
      declencheur: '@bureau',
      type_cible: 'mission',
      id_cible: element.id,
      avant: null,
      apres: element,
    });
    expect(broadcasts).toEqual([event]);
    const [journalled] = await listEvents(ctx, { type_cible: 'mission', id_cible: String(element.id) });
    expect(journalled).toEqual(event);
  });

  it('refuses invalid input with a French message and writes nothing', async () => {
    const { ctx, broadcasts } = createTestContext();
    const missions = await countRows('missions');
    const events = await countRows('events');

    await expect(createElement(ctx, 'mission', { titre: '', type: 'voyage' })).rejects.toMatchObject({
      code: 'validation',
      status: 400,
    });
    await expect(createElement(ctx, 'mission', { titre: 'Ok', type: 'dev', pirate: true })).rejects.toThrow(
      /Clé non reconnue/,
    );

    expect(await countRows('missions')).toBe(missions);
    expect(await countRows('events')).toBe(events);
    expect(broadcasts).toEqual([]);
  });

  it('gives a sub-agent the provider of its parent', async () => {
    const { ctx } = createTestContext();
    const { element } = await createElement(ctx, 'agent', {
      parent_id: 'agent-technicien',
      nom: 'Testeur',
      fonction: 'Écrit les tests',
    });
    expect(element).toMatchObject({ parent_id: 'agent-technicien', fournisseur: 'deepseek' });
    expect(await countRows('agent_versions', `agent_id = '${String(element.id)}' AND version = 1`)).toBe(1);

    await expect(
      createElement(ctx, 'agent', {
        parent_id: 'agent-technicien',
        fournisseur: 'gemini',
        nom: 'Intrus',
        fonction: 'x',
      }),
    ).rejects.toThrow(/fournisseur de son parent/);
  });

  it('requires a provider for a top-level agent', async () => {
    const { ctx } = createTestContext();
    await expect(createElement(ctx, 'agent', { nom: 'Solo', fonction: 'x' })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('never lets a Gemini agent accept private tasks', async () => {
    const { ctx } = createTestContext();
    await expect(
      createElement(ctx, 'agent', { fournisseur: 'gemini', nom: 'Bavard', fonction: 'x', accepte_prive: true }),
    ).rejects.toThrow(/tâches privées/);
    await expect(updateElement(ctx, 'agent', 'agent-redacteur', { accepte_prive: true })).rejects.toThrow(
      /tâches privées/,
    );
  });

  it('places furniture with catalogue defaults and keeps it inside the room', async () => {
    const { ctx } = createTestContext();
    const { element } = await createElement(ctx, 'meuble', {
      salle_id: 'salle-pause',
      modele_id: 'plante',
      x: 2,
      y: 6,
    });
    expect(element).toMatchObject({ variante: 'ficus', coloris: 'terracotta', rotation: 0 });

    await expect(
      createElement(ctx, 'meuble', { salle_id: 'salle-pause', modele_id: 'plante', variante: 'baobab', x: 0, y: 0 }),
    ).rejects.toThrow(/Variante inconnue/);
    // The table is 4 cells wide: it does not fit at x = 8 in a 10-cell room…
    await expect(
      createElement(ctx, 'meuble', { salle_id: 'salle-pause', modele_id: 'table-reunion', x: 8, y: 0 }),
    ).rejects.toThrow(/dépasse de la salle/);
    // …but it does once turned a quarter (2 cells wide, 4 deep).
    await expect(
      createElement(ctx, 'meuble', { salle_id: 'salle-pause', modele_id: 'table-reunion', x: 8, y: 0, rotation: 90 }),
    ).resolves.toBeDefined();
  });

  it('only adds tasks to an open mission', async () => {
    const { ctx } = createTestContext();
    const { element: mission } = await createElement(ctx, 'mission', { titre: 'Site vitrine', type: 'dev' });
    const missionId = String(mission.id);
    await createElement(ctx, 'tache', { mission_id: missionId, agent_id: 'agent-technicien', brief: 'Maquette' });

    await updateElement(ctx, 'mission', missionId, { statut: 'cloturee', bilan: 'Livré' });
    await expect(
      createElement(ctx, 'tache', { mission_id: missionId, agent_id: 'agent-technicien', brief: 'Retouche' }),
    ).rejects.toMatchObject({ code: 'conflit' });
  });

  it('cannot create a setting', async () => {
    const { ctx } = createTestContext();
    await expect(createElement(ctx, 'reglage', { valeur: 1 })).rejects.toMatchObject({ code: 'interdit' });
  });
});

describe('updating elements', () => {
  it('journals only the fields that really changed', async () => {
    const { ctx, broadcasts } = createTestContext();
    const { element, event } = await updateElement(ctx, 'agent', 'agent-chercheur', {
      pseudo: 'Sherlock',
      nom: 'Chercheur',
    });
    expect(element).toMatchObject({ pseudo: 'Sherlock', nom: 'Chercheur' });
    expect(event).toMatchObject({
      type: 'modification',
      avant: { pseudo: null },
      apres: { pseudo: 'Sherlock' },
    });
    expect(broadcasts).toHaveLength(1);
  });

  it('writes no event when nothing changes', async () => {
    const { ctx, broadcasts } = createTestContext();
    const events = await countRows('events');
    const { event } = await updateElement(ctx, 'agent', 'agent-chef', { nom: 'Chef' });
    expect(event).toBeNull();
    expect(await countRows('events')).toBe(events);
    expect(broadcasts).toEqual([]);
  });

  it("adds a version each time an agent's role or instructions change", async () => {
    const { ctx } = createTestContext({ auteur: 'chef' });
    await updateElement(ctx, 'agent', 'agent-technicien', { fonction: 'Scripts et automatisation' });
    await updateElement(ctx, 'agent', 'agent-technicien', { consignes: 'Toujours commenter le code.' });
    await updateElement(ctx, 'agent', 'agent-technicien', { pseudo: 'Bob' });

    const { results } = await ctx.db
      .prepare("SELECT version, fonction, consignes, auteur FROM agent_versions WHERE agent_id = 'agent-technicien' ORDER BY version")
      .all();
    expect(results).toHaveLength(3);
    expect(results[1]).toMatchObject({ version: 2, fonction: 'Scripts et automatisation', auteur: 'chef' });
    expect(results[2]).toMatchObject({
      version: 3,
      fonction: 'Scripts et automatisation',
      consignes: 'Toujours commenter le code.',
    });
  });

  it('dates a mission when it is closed and clears the date when reopened', async () => {
    const { ctx } = createTestContext();
    const { element } = await createElement(ctx, 'mission', { titre: 'Bilan annuel', type: 'cadrage' });
    const id = String(element.id);

    const closed = await updateElement(ctx, 'mission', id, { statut: 'cloturee', bilan: 'Terminé' });
    expect(closed.element.cloturee_le).toEqual(expect.any(String));
    const reopened = await updateElement(ctx, 'mission', id, { statut: 'ouverte' });
    expect(reopened.element.cloturee_le).toBeNull();
  });

  it('validates a setting against the type of its key', async () => {
    const { ctx } = createTestContext();
    const { element } = await updateElement(ctx, 'reglage', 'plafond_par_mission', { valeur: 2.5 });
    expect(element.valeur).toBe(2.5);
    expect((await readElement(ctx, 'reglage', 'plafond_par_mission')).valeur).toBe(2.5);

    await expect(updateElement(ctx, 'reglage', 'prive_vers_deepseek', { valeur: 'oui' })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(updateElement(ctx, 'reglage', 'qualite_graphique', { valeur: 'ultra' })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('refuses fields that cannot be changed and empty changes', async () => {
    const { ctx } = createTestContext();
    await expect(updateElement(ctx, 'agent', 'agent-redacteur', { fournisseur: 'deepseek' })).rejects.toMatchObject(
      { code: 'validation' },
    );
    await expect(updateElement(ctx, 'agent', 'agent-redacteur', {})).rejects.toThrow(/au moins un champ/);
  });
});

describe('trash', () => {
  it('sends an element to the trash and takes it back out', async () => {
    const { ctx } = createTestContext();
    const { element } = await createElement(ctx, 'salle', {
      type: 'bureau',
      nom: 'Bureau annexe',
      position_x: 40,
      position_y: 0,
      largeur: 6,
      profondeur: 6,
    });
    const id = String(element.id);

    const deleted = await deleteElement(ctx, 'salle', id);
    expect(deleted.event).toMatchObject({ type: 'suppression', avant: { supprime_le: null } });
    await expect(readElement(ctx, 'salle', id)).rejects.toMatchObject({ code: 'introuvable' });
    expect((await listElements(ctx, 'salle')).some((room) => room.id === id)).toBe(false);
    expect((await listElements(ctx, 'salle', { corbeille: true })).map((room) => room.id)).toContain(id);

    const restored = await restoreElement(ctx, 'salle', id);
    expect(restored.event).toMatchObject({ type: 'restauration', apres: { supprime_le: null } });
    expect(await readElement(ctx, 'salle', id)).toMatchObject({ nom: 'Bureau annexe', supprime_le: null });
  });

  it('refuses to restore what is not in the trash', async () => {
    const { ctx } = createTestContext();
    await expect(restoreElement(ctx, 'agent', 'agent-chef')).rejects.toMatchObject({ code: 'conflit' });
  });

  it('never deletes the chef nor a setting', async () => {
    const { ctx } = createTestContext();
    await expect(deleteElement(ctx, 'agent', 'agent-chef')).rejects.toMatchObject({ code: 'interdit' });
    await expect(deleteElement(ctx, 'reglage', 'theme')).rejects.toMatchObject({ code: 'interdit' });
  });
});
