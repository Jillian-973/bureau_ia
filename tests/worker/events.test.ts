import { describe, expect, it } from 'vitest';
import {
  createElement,
  deleteElement,
  readElement,
  updateElement,
} from '../../src/worker/services/elements';
import { getLastEventId, listEvents, readEvent, undoEvent } from '../../src/worker/services/events';
import { confirmPermanentDeletion, emptyTrash, requestPermanentDeletion } from '../../src/worker/services/trash';
import { countRows, createTestContext } from './helpers';

describe('event journal', () => {
  it('lists the latest events first, or the ones after an id in order', async () => {
    const { ctx } = createTestContext();
    const start = await getLastEventId(ctx.db);
    await updateElement(ctx, 'agent', 'agent-chercheur', { pseudo: 'Un' });
    await updateElement(ctx, 'agent', 'agent-chercheur', { pseudo: 'Deux' });

    const latest = await listEvents(ctx, { limite: 2 });
    expect(latest.map((event) => event.apres?.pseudo)).toEqual(['Deux', 'Un']);
    const sinceStart = await listEvents(ctx, { apres: start });
    expect(sinceStart.map((event) => event.apres?.pseudo)).toEqual(['Un', 'Deux']);
    expect(await getLastEventId(ctx.db)).toBe(sinceStart[1]?.id);
  });
});

describe('undo', () => {
  it('puts changed fields back and journals the undo', async () => {
    const { ctx, broadcasts } = createTestContext();
    const { event } = await updateElement(ctx, 'agent', 'agent-redacteur', {
      nom: 'Plume',
      pseudo: 'La Plume',
    });

    const undone = await undoEvent(ctx, event!.id);
    expect(undone.element).toMatchObject({ nom: 'Rédacteur', pseudo: null });
    expect(await readElement(ctx, 'agent', 'agent-redacteur')).toMatchObject({ nom: 'Rédacteur', pseudo: null });
    expect(undone.event).toMatchObject({
      type: 'annulation',
      avant: { nom: 'Plume', pseudo: 'La Plume' },
      apres: { nom: 'Rédacteur', pseudo: null },
    });
    expect((await readEvent(ctx, event!.id)).annule_par).toBe(undone.event!.id);
    expect(broadcasts.map((item) => item.type)).toEqual(['modification', 'annulation']);
  });

  it('leaves later changes to other fields untouched', async () => {
    const { ctx } = createTestContext();
    const first = await updateElement(ctx, 'salle', 'salle-jeux', { nom: 'Arcade' });
    await updateElement(ctx, 'salle', 'salle-jeux', { largeur: 12 });

    await undoEvent(ctx, first.event!.id);
    expect(await readElement(ctx, 'salle', 'salle-jeux')).toMatchObject({ nom: 'Salle de jeux', largeur: 12 });
  });

  it('refuses to undo the same event twice', async () => {
    const { ctx } = createTestContext();
    const { event } = await updateElement(ctx, 'mission', await newMission(ctx), { titre: 'Renommée' });
    await undoEvent(ctx, event!.id);
    await expect(undoEvent(ctx, event!.id)).rejects.toMatchObject({ code: 'conflit' });
  });

  it('can undo an undo', async () => {
    const { ctx } = createTestContext();
    const id = await newMission(ctx);
    const { event } = await updateElement(ctx, 'mission', id, { titre: 'Version B' });
    const undone = await undoEvent(ctx, event!.id);
    await undoEvent(ctx, undone.event!.id);
    expect((await readElement(ctx, 'mission', id)).titre).toBe('Version B');
  });

  it('sends a created element to the trash', async () => {
    const { ctx } = createTestContext();
    const created = await createElement(ctx, 'mission', { titre: 'Erreur de saisie', type: 'perso' });
    await undoEvent(ctx, created.event!.id);
    await expect(readElement(ctx, 'mission', String(created.element.id))).rejects.toMatchObject({
      code: 'introuvable',
    });
    expect(await readElement(ctx, 'mission', String(created.element.id), { includeDeleted: true })).toMatchObject({
      titre: 'Erreur de saisie',
    });
  });

  it('restores a deleted element', async () => {
    const { ctx } = createTestContext();
    const id = await newMission(ctx);
    const deleted = await deleteElement(ctx, 'mission', id);
    await undoEvent(ctx, deleted.event!.id);
    expect((await readElement(ctx, 'mission', id)).supprime_le).toBeNull();
  });

  it("adds an agent version when it reverts a role change", async () => {
    const { ctx } = createTestContext();
    const before = await countRows('agent_versions', "agent_id = 'agent-developpeur'");
    const { event } = await updateElement(ctx, 'agent', 'agent-developpeur', { fonction: 'Relecture seule' });
    await undoEvent(ctx, event!.id);

    expect(await countRows('agent_versions', "agent_id = 'agent-developpeur'")).toBe(before + 2);
    const latest = await ctx.db
      .prepare("SELECT fonction FROM agent_versions WHERE agent_id = 'agent-developpeur' ORDER BY version DESC LIMIT 1")
      .first<{ fonction: string }>();
    expect(latest?.fonction).toBe('Génération et relecture de code');
  });

  it('fails on an unknown event', async () => {
    const { ctx } = createTestContext();
    await expect(undoEvent(ctx, 999_999)).rejects.toMatchObject({ code: 'introuvable' });
  });
});

describe('permanent deletion', () => {
  it('takes a request, then a confirmation with a single-use token', async () => {
    const { ctx, broadcasts } = createTestContext();
    const id = await newMission(ctx);
    broadcasts.length = 0;

    const { jeton, expire_le } = await requestPermanentDeletion(ctx, 'mission', id);
    expect(jeton.length).toBeGreaterThanOrEqual(32);
    expect(new Date(expire_le).getTime()).toBeGreaterThan(Date.now());
    // Nothing is deleted before the confirmation, and the token is not stored in clear.
    expect(await readElement(ctx, 'mission', id)).toBeDefined();
    expect(await countRows('jetons_confirmation', `jeton_hash = '${jeton}'`)).toBe(0);

    const event = await confirmPermanentDeletion(ctx, jeton);
    expect(event).toMatchObject({ type: 'suppression_definitive', id_cible: id, apres: null });
    expect(event.avant).toMatchObject({ id, titre: 'Mission de test' });
    expect(await countRows('missions', `id = '${id}'`)).toBe(0);
    expect(broadcasts).toEqual([event]);

    await expect(confirmPermanentDeletion(ctx, jeton)).rejects.toMatchObject({ code: 'jeton_invalide' });
  });

  it('refuses a wrong or expired token', async () => {
    const id = await newMission(createTestContext().ctx);
    await expect(confirmPermanentDeletion(createTestContext().ctx, 'pas-le-bon-jeton')).rejects.toMatchObject({
      code: 'jeton_invalide',
    });

    const past = createTestContext({ now: () => new Date(Date.now() - 11 * 60 * 1000) });
    const { jeton } = await requestPermanentDeletion(past.ctx, 'mission', id);
    await expect(confirmPermanentDeletion(createTestContext().ctx, jeton)).rejects.toMatchObject({
      code: 'jeton_invalide',
    });
    expect(await countRows('missions', `id = '${id}'`)).toBe(1);
  });

  it('cannot be undone', async () => {
    const { ctx } = createTestContext();
    const id = await newMission(ctx);
    const { jeton } = await requestPermanentDeletion(ctx, 'mission', id);
    const event = await confirmPermanentDeletion(ctx, jeton);
    await expect(undoEvent(ctx, event.id)).rejects.toMatchObject({ code: 'interdit' });
  });

  it('refuses the chef, and elements that others still depend on', async () => {
    const { ctx } = createTestContext();
    await expect(requestPermanentDeletion(ctx, 'agent', 'agent-chef')).rejects.toMatchObject({ code: 'interdit' });

    const { jeton } = await requestPermanentDeletion(ctx, 'salle', 'salle-reunion');
    await expect(confirmPermanentDeletion(ctx, jeton)).rejects.toMatchObject({ code: 'conflit' });
    expect(await countRows('salles', "id = 'salle-reunion'")).toBe(1);
  });

  it('removes the versions of a deleted agent with it', async () => {
    const { ctx } = createTestContext();
    const { element } = await createElement(ctx, 'agent', { fournisseur: 'deepseek', nom: 'Stagiaire', fonction: 'Aide' });
    const id = String(element.id);
    const { jeton } = await requestPermanentDeletion(ctx, 'agent', id);
    await confirmPermanentDeletion(ctx, jeton);
    expect(await countRows('agents', `id = '${id}'`)).toBe(0);
    expect(await countRows('agent_versions', `agent_id = '${id}'`)).toBe(0);
  });
});

describe('emptying the trash', () => {
  it('only purges what was deleted more than 30 days ago', async () => {
    const day = 24 * 60 * 60 * 1000;
    const longAgo = createTestContext({ now: () => new Date(Date.now() - 31 * day) });
    const recently = createTestContext({ now: () => new Date(Date.now() - 29 * day) });

    const oldId = await newMission(longAgo.ctx);
    await deleteElement(longAgo.ctx, 'mission', oldId);
    const recentId = await newMission(recently.ctx);
    await deleteElement(recently.ctx, 'mission', recentId);
    const liveId = await newMission(longAgo.ctx);

    const system = createTestContext({ auteur: 'systeme' });
    expect(await emptyTrash(system.ctx)).toBe(1);
    expect(await countRows('missions', `id = '${oldId}'`)).toBe(0);
    expect(await countRows('missions', `id IN ('${recentId}', '${liveId}')`)).toBe(2);
    expect(system.broadcasts[0]).toMatchObject({ type: 'suppression_definitive', auteur: 'systeme' });
  });

  it('purges a room together with its furniture, children first', async () => {
    const day = 24 * 60 * 60 * 1000;
    const longAgo = createTestContext({ now: () => new Date(Date.now() - 40 * day) });
    const room = await createElement(longAgo.ctx, 'salle', {
      type: 'pause',
      nom: 'Débarras',
      position_x: 60,
      position_y: 0,
      largeur: 5,
      profondeur: 5,
    });
    const roomId = String(room.element.id);
    const plant = await createElement(longAgo.ctx, 'meuble', { salle_id: roomId, modele_id: 'plante', x: 1, y: 1 });
    await deleteElement(longAgo.ctx, 'meuble', String(plant.element.id));
    await deleteElement(longAgo.ctx, 'salle', roomId);

    expect(await emptyTrash(createTestContext({ auteur: 'systeme' }).ctx)).toBe(2);
    expect(await countRows('salles', `id = '${roomId}'`)).toBe(0);
  });
});

async function newMission(ctx: ReturnType<typeof createTestContext>['ctx']): Promise<string> {
  const { element } = await createElement(ctx, 'mission', { titre: 'Mission de test', type: 'recherche' });
  return String(element.id);
}
