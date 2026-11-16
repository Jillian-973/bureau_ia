/**
 * Permanent deletion. It is the only change that cannot be undone, so it
 * takes two steps: a request that returns a single-use token, then a
 * confirmation with that token. The trash is also emptied after 30 days.
 */
import type { ElementRecord, ElementType } from '../../shared/schemas/elements';
import type { BureauEvent } from '../../shared/schemas/events';
import type { ServiceContext } from './context';
import { DEFINITIONS } from './definitions';
import type { ElementDefinition } from './definitions';
import { commitChange, findElement, getDefinition, readElement } from './elements';
import { ServiceError } from './errors';
import { applyDeleteRules } from './rules';

const TOKEN_LIFETIME_MS = 10 * 60 * 1000;
export const TRASH_RETENTION_DAYS = 30;
/** Children first, so parents are no longer referenced when their turn comes. */
const PURGE_ORDER: readonly ElementType[] = ['meuble', 'tache', 'avatar', 'salle', 'mission', 'agent'];

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export interface DeletionRequest {
  jeton: string;
  expire_le: string;
}

/** Step 1: asks for a permanent deletion and returns the token that confirms it. */
export async function requestPermanentDeletion(
  ctx: ServiceContext,
  type: ElementType,
  id: string,
): Promise<DeletionRequest> {
  const definition = getDefinition(type);
  if (!definition.lifecycle) {
    throw new ServiceError('interdit', `${definition.label} : ce type ne se supprime pas.`);
  }
  applyDeleteRules(definition, await readElement(ctx, type, id, { includeDeleted: true }));

  const now = ctx.now();
  const jeton = generateToken();
  const expire_le = new Date(now.getTime() + TOKEN_LIFETIME_MS).toISOString();
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM jetons_confirmation WHERE expire_le < ?').bind(now.toISOString()),
    ctx.db
      .prepare('INSERT INTO jetons_confirmation (jeton_hash, type_cible, id_cible, expire_le) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(jeton), type, id, expire_le),
  ]);
  return { jeton, expire_le };
}

/** Removes a row for good and journals it with a last snapshot. */
async function deleteForGood(
  ctx: ServiceContext,
  definition: ElementDefinition,
  element: ElementRecord,
): Promise<BureauEvent> {
  const id = String(element.id);
  const horodatage = ctx.now().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (definition.type === 'agent') {
    statements.push(ctx.db.prepare('DELETE FROM agent_versions WHERE agent_id = ?').bind(id));
  }
  statements.push(ctx.db.prepare(`DELETE FROM ${definition.table} WHERE id = ?`).bind(id));
  statements.push(
    ctx.db
      .prepare(
        `INSERT INTO events (horodatage, auteur, auteur_id, type, type_cible, id_cible, avant, apres, declencheur)
         VALUES (?, ?, ?, 'suppression_definitive', ?, ?, ?, NULL, ?) RETURNING id`,
      )
      .bind(
        horodatage,
        ctx.auteur,
        ctx.auteurId ?? null,
        definition.type,
        id,
        JSON.stringify(element),
        ctx.declencheur ?? null,
      ),
  );
  return commitChange(ctx, statements, statements.length - 1, {
    horodatage,
    type: 'suppression_definitive',
    type_cible: definition.type,
    id_cible: id,
    avant: element,
    apres: null,
  });
}

/** Step 2: confirms with the token. A token works once, for one element, for ten minutes. */
export async function confirmPermanentDeletion(ctx: ServiceContext, jeton: string): Promise<BureauEvent> {
  const request = await ctx.db
    .prepare('DELETE FROM jetons_confirmation WHERE jeton_hash = ? RETURNING type_cible, id_cible, expire_le')
    .bind(await hashToken(jeton))
    .first<{ type_cible: ElementType; id_cible: string; expire_le: string }>();
  if (!request || request.expire_le < ctx.now().toISOString()) {
    throw new ServiceError(
      'jeton_invalide',
      'Jeton de confirmation invalide, expiré ou déjà utilisé. Refais la demande de suppression définitive.',
    );
  }
  const definition = getDefinition(request.type_cible);
  const element = await findElement(ctx, definition, request.id_cible);
  if (!element) {
    throw new ServiceError('introuvable', `${definition.label} introuvable : ${request.id_cible}`);
  }
  return deleteForGood(ctx, definition, element);
}

/**
 * Empties the trash of everything deleted more than 30 days ago. Elements
 * still referenced by something alive are kept for the next run.
 */
export async function emptyTrash(ctx: ServiceContext): Promise<number> {
  const cutoff = new Date(ctx.now().getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let purged = 0;
  for (const type of PURGE_ORDER) {
    const definition = DEFINITIONS[type];
    const { results } = await ctx.db
      .prepare(`SELECT id FROM ${definition.table} WHERE supprime_le IS NOT NULL AND supprime_le < ?`)
      .bind(cutoff)
      .all<{ id: string }>();
    for (const { id } of results) {
      const element = await findElement(ctx, definition, id);
      if (!element) continue;
      try {
        await deleteForGood(ctx, definition, element);
        purged += 1;
      } catch (error) {
        if (!(error instanceof ServiceError && error.code === 'conflit')) throw error;
      }
    }
  }
  return purged;
}
