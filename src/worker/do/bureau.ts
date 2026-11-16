import { DurableObject } from 'cloudflare:workers';
import type { BureauEvent, RealtimeMessage } from '../../shared/schemas/events';
import { getLastEventId } from '../services/events';

/**
 * The single "Bureau" Durable Object: the meeting point of every open view of
 * the office. It keeps their WebSockets and pushes each journal event to
 * them. Sockets use the hibernation API, so the object costs nothing while
 * nobody is talking.
 */
export class Bureau extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** Accepts a WebSocket and greets it with the id of the latest event. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket attendu', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    // A client that knows this id can ask the journal for anything it missed.
    this.send(server, { type: 'bienvenue', dernier_evenement_id: await getLastEventId(this.env.DB) });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Pushes an event to every connected view. Returns how many received it. */
  broadcast(event: BureauEvent): number {
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      if (this.send(socket, { type: 'evenement', evenement: event })) delivered += 1;
    }
    return delivered;
  }

  /** Number of views currently connected. */
  countConnections(): number {
    return this.ctx.getWebSockets().length;
  }

  // Views only listen: whatever they send is ignored.
  override webSocketMessage(): void {}

  override webSocketClose(socket: WebSocket, code: number, reason: string): void {
    try {
      // 1005 and 1006 mean "no status" and cannot be sent back.
      socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
  }

  override webSocketError(socket: WebSocket): void {
    try {
      socket.close(1011, 'Erreur de connexion');
    } catch {
      // Already closed.
    }
  }

  private send(socket: WebSocket, message: RealtimeMessage): boolean {
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }
}
