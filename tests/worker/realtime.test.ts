import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '../../src/shared/schemas/events';
import { createLiveContext, getBureau } from '../../src/worker/realtime';
import { createElement, updateElement } from '../../src/worker/services/elements';
import { getLastEventId } from '../../src/worker/services/events';

/** Opens a view: a WebSocket that records every message it receives. */
async function openView() {
  const response = await SELF.fetch('https://bureau.test/ws', { headers: { Upgrade: 'websocket' } });
  const socket = response.webSocket;
  if (!socket) throw new Error(`No WebSocket in the response (status ${response.status})`);
  const messages: RealtimeMessage[] = [];
  const waiters: Array<() => void> = [];
  socket.addEventListener('message', (event) => {
    if (event.data === 'pong') return; // keep-alive answer, not a JSON message
    messages.push(JSON.parse(event.data as string) as RealtimeMessage);
    waiters.splice(0).forEach((resolve) => resolve());
  });
  socket.accept();

  /** Resolves once at least `count` messages have arrived. */
  const waitFor = async (count: number) => {
    while (messages.length < count) {
      await new Promise<void>((resolve, reject) => {
        waiters.push(resolve);
        setTimeout(() => reject(new Error(`Timed out waiting for message ${count}`)), 2000);
      });
    }
    return messages;
  };
  return { socket, messages, waitFor };
}

describe('real-time feed', () => {
  it('refuses a plain HTTP request', async () => {
    const response = await SELF.fetch('https://bureau.test/ws');
    expect(response.status).toBe(426);
  });

  it('greets a new view with the id of the latest event', async () => {
    const view = await openView();
    const [welcome] = await view.waitFor(1);
    expect(welcome).toEqual({ type: 'bienvenue', dernier_evenement_id: await getLastEventId(env.DB) });
    view.socket.close(1000, 'done');
  });

  it('pushes every change to all open views', async () => {
    const first = await openView();
    const second = await openView();
    await Promise.all([first.waitFor(1), second.waitFor(1)]);
    expect(await getBureau(env).countConnections()).toBeGreaterThanOrEqual(2);

    const ctx = createLiveContext(env, { auteur: 'chef', declencheur: '/bureau' });
    const created = await createElement(ctx, 'mission', { titre: 'Veille concurrentielle', type: 'recherche' });
    const updated = await updateElement(ctx, 'mission', String(created.element.id), { brief: 'Trois concurrents' });

    for (const view of [first, second]) {
      const messages = await view.waitFor(3);
      expect(messages.slice(1)).toEqual([
        { type: 'evenement', evenement: created.event },
        { type: 'evenement', evenement: updated.event },
      ]);
      view.socket.close(1000, 'done');
    }
  });

  it('answers keep-alive pings', async () => {
    const view = await openView();
    await view.waitFor(1);
    const pong = new Promise<string>((resolve) => {
      view.socket.addEventListener('message', (event) => {
        if (event.data === 'pong') resolve(event.data);
      });
    });
    view.socket.send('ping');
    expect(await pong).toBe('pong');
    view.socket.close(1000, 'done');
  });

  it('keeps saving changes when nobody is listening', async () => {
    const ctx = createLiveContext(env, { auteur: 'utilisateur' });
    const { event } = await updateElement(ctx, 'reglage', 'nom_bureau', { valeur: 'Agence 360' });
    expect(event?.apres).toEqual({ valeur: 'Agence 360' });
  });
});
