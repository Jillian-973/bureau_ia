/**
 * The event journal: reading it (history, real-time catch-up) and undoing
 * one of its events.
 */
import type { ElementRecord } from '../../shared/schemas/elements';
import type { BureauEvent } from '../../shared/schemas/events';
import type { ServiceContext } from './context';
import { applyChanges, findElement, getDefinition } from './elements';
import type { ChangeResult } from './elements';
import { ServiceError } from './errors';

const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 200;

interface EventRow extends Omit<BureauEvent, 'avant' | 'apres'> {
  avant: string | null;
  apres: string | null;
}

function fromEventRow(row: EventRow): BureauEvent {
  return {
    ...row,
    avant: row.avant === null ? null : (JSON.parse(row.avant) as ElementRecord),
    apres: row.apres === null ? null : (JSON.parse(row.apres) as ElementRecord),
  };
}

export interface EventListOptions {
  /** Only events newer than this id, oldest first (used to catch up after a reconnection). */
  apres?: number;
  type_cible?: string;
  id_cible?: string;
  limite?: number;
}

/** Lists events. Without `apres`, the most recent ones come first. */
export async function listEvents(ctx: ServiceContext, options: EventListOptions = {}): Promise<BureauEvent[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.apres !== undefined) {
    conditions.push('id > ?');
    values.push(options.apres);
  }
  if (options.type_cible) {
    conditions.push('type_cible = ?');
    values.push(options.type_cible);
  }
  if (options.id_cible) {
    conditions.push('id_cible = ?');
    values.push(options.id_cible);
  }
  const limit = Math.min(Math.max(1, options.limite ?? DEFAULT_EVENT_LIMIT), MAX_EVENT_LIMIT);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = options.apres !== undefined ? 'ASC' : 'DESC';
  const { results } = await ctx.db
    .prepare(`SELECT * FROM events ${where} ORDER BY id ${order} LIMIT ?`)
    .bind(...values, limit)
    .all<EventRow>();
  return results.map(fromEventRow);
}

/** Id of the most recent event, 0 when the journal is empty. */
export async function getLastEventId(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT MAX(id) AS id FROM events').first<{ id: number | null }>();
  return row?.id ?? 0;
}

export async function readEvent(ctx: ServiceContext, id: number): Promise<BureauEvent> {
  const row = await ctx.db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventRow>();
  if (!row) throw new ServiceError('introuvable', `Événement introuvable : ${id}`);
  return fromEventRow(row);
}

/**
 * Undoes one event: the fields it changed go back to their previous values.
 * Undoing a creation sends the element to the trash. The undo is itself an
 * event, so it can be undone too.
 */
export async function undoEvent(ctx: ServiceContext, id: number): Promise<ChangeResult> {
  const event = await readEvent(ctx, id);
  if (event.annule_par !== null) {
    throw new ServiceError('conflit', `L'événement ${id} a déjà été annulé (par l'événement ${event.annule_par}).`);
  }
  if (event.type === 'suppression_definitive') {
    throw new ServiceError('interdit', 'Une suppression définitive ne peut pas être annulée.');
  }

  const definition = getDefinition(event.type_cible);
  const current = await findElement(ctx, definition, event.id_cible);
  if (!current) {
    throw new ServiceError('conflit', "Annulation impossible : l'élément a été supprimé définitivement.");
  }

  const changes = event.avant ?? { supprime_le: ctx.now().toISOString() };
  const result = await applyChanges(ctx, definition, current, changes, 'annulation', { undoneEventId: id });
  if (!result.event) {
    throw new ServiceError('conflit', "Rien à annuler : l'élément est déjà dans son état d'avant.");
  }
  return result;
}
