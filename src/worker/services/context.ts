import type { Author, BureauEvent, Trigger } from '../../shared/schemas/events';

/**
 * Everything a service needs to make a change: where the data lives, who is
 * acting, and how to tell connected clients about it.
 */
export interface ServiceContext {
  db: D1Database;
  auteur: Author;
  /** Agent id when the author is an agent. */
  auteurId?: string | null;
  /** Trigger word of the MCP call, journalled with every change it makes. */
  declencheur?: Trigger | null;
  /** Pushes an event to connected clients. Must never throw. */
  broadcast: (event: BureauEvent) => Promise<void>;
  now: () => Date;
}

export interface ServiceContextOptions {
  auteur: Author;
  auteurId?: string | null;
  declencheur?: Trigger | null;
  broadcast?: (event: BureauEvent) => Promise<void>;
  now?: () => Date;
}

/** Builds a service context on a database. Without `broadcast`, events are only journalled. */
export function createServiceContext(db: D1Database, options: ServiceContextOptions): ServiceContext {
  const broadcast = options.broadcast;
  return {
    db,
    auteur: options.auteur,
    auteurId: options.auteurId ?? null,
    declencheur: options.declencheur ?? null,
    broadcast: async (event) => {
      if (!broadcast) return;
      try {
        await broadcast(event);
      } catch (error) {
        // The change is saved and journalled; a missed live update is recovered
        // by clients when they reconnect and read the journal.
        console.error('Real-time broadcast failed', error);
      }
    },
    now: options.now ?? (() => new Date()),
  };
}
