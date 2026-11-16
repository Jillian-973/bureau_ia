/**
 * The single way to read and change office elements. MCP tools, the REST API
 * and workflows all go through these functions; none writes to the database
 * directly. Every change is validated, journalled as an event, broadcast in
 * real time and can be undone from its event.
 */
import { describeValidationError, elementTypeSchema } from '../../shared/schemas/elements';
import type { ElementRecord, ElementType } from '../../shared/schemas/elements';
import type { BureauEvent, EventType } from '../../shared/schemas/events';
import type { ServiceContext } from './context';
import { DEFINITIONS, fromRow, generateId, toColumnValue } from './definitions';
import type { ElementDefinition } from './definitions';
import { ServiceError, withConstraintErrors } from './errors';
import { applyCreateRules, applyDeleteRules, applyUpdateRules } from './rules';

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

export interface ChangeResult {
  element: ElementRecord;
  /** Null when the request changed nothing. */
  event: BureauEvent | null;
}

export function getDefinition(type: string): ElementDefinition {
  const parsed = elementTypeSchema.safeParse(type);
  if (!parsed.success) {
    throw new ServiceError(
      'validation',
      `Type d'élément inconnu : ${type}. Types possibles : ${elementTypeSchema.options.join(', ')}`,
    );
  }
  return DEFINITIONS[parsed.data];
}

function validate(schema: NonNullable<ElementDefinition['createSchema']>, input: unknown): ElementRecord {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError('validation', describeValidationError(result.error));
  return result.data;
}

/** Reads a row whatever its state, decoded, or null when it does not exist. */
export async function findElement(
  ctx: ServiceContext,
  definition: ElementDefinition,
  id: string,
): Promise<ElementRecord | null> {
  const row = await ctx.db
    .prepare(`SELECT * FROM ${definition.table} WHERE ${definition.idColumn} = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? fromRow(definition, row) : null;
}

export async function readElement(
  ctx: ServiceContext,
  type: ElementType,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<ElementRecord> {
  const definition = getDefinition(type);
  const element = await findElement(ctx, definition, id);
  if (!element || (!options.includeDeleted && element.supprime_le)) {
    throw new ServiceError('introuvable', `${definition.label} introuvable : ${id}`);
  }
  return element;
}

export interface ListOptions {
  /** Equality filters on the columns allowed for the type. */
  filters?: Record<string, string | number | boolean | null>;
  /** True to list the trash instead of live elements. */
  corbeille?: boolean;
  limite?: number;
}

export async function listElements(
  ctx: ServiceContext,
  type: ElementType,
  options: ListOptions = {},
): Promise<ElementRecord[]> {
  const definition = getDefinition(type);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (definition.lifecycle) {
    conditions.push(options.corbeille ? 'supprime_le IS NOT NULL' : 'supprime_le IS NULL');
  }
  for (const [column, value] of Object.entries(options.filters ?? {})) {
    if (!definition.filterColumns.includes(column)) {
      throw new ServiceError(
        'validation',
        `Filtre inconnu : ${column}. Filtres possibles : ${definition.filterColumns.join(', ') || 'aucun'}`,
      );
    }
    if (value === null) {
      conditions.push(`${column} IS NULL`);
    } else {
      conditions.push(`${column} = ?`);
      values.push(toColumnValue(definition, column, value));
    }
  }

  const limit = Math.min(Math.max(1, options.limite ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = definition.lifecycle ? 'cree_le, id' : definition.idColumn;
  const { results } = await ctx.db
    .prepare(`SELECT * FROM ${definition.table} ${where} ORDER BY ${order} LIMIT ?`)
    .bind(...values, limit)
    .all<Record<string, unknown>>();
  return results.map((row) => fromRow(definition, row));
}

/** Statement that journals a change and returns the id of the new event. */
function eventStatement(
  ctx: ServiceContext,
  horodatage: string,
  type: EventType,
  definition: ElementDefinition,
  id: string,
  avant: ElementRecord | null,
  apres: ElementRecord | null,
): D1PreparedStatement {
  return ctx.db
    .prepare(
      `INSERT INTO events (horodatage, auteur, auteur_id, type, type_cible, id_cible, avant, apres, declencheur)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      horodatage,
      ctx.auteur,
      ctx.auteurId ?? null,
      type,
      definition.type,
      id,
      avant === null ? null : JSON.stringify(avant),
      apres === null ? null : JSON.stringify(apres),
      ctx.declencheur ?? null,
    );
}

/** Every change of an agent's role or instructions adds a version (rule 6 of section 4). */
function versionStatement(
  ctx: ServiceContext,
  horodatage: string,
  agentId: string,
  agent: ElementRecord,
): D1PreparedStatement {
  return ctx.db
    .prepare(
      `INSERT INTO agent_versions (agent_id, version, fonction, consignes, auteur, cree_le)
       SELECT ?1, COALESCE(MAX(version), 0) + 1, ?2, ?3, ?4, ?5 FROM agent_versions WHERE agent_id = ?1`,
    )
    .bind(agentId, agent.fonction, agent.consignes, ctx.auteur, horodatage);
}

/**
 * Runs the statements of one change atomically, then builds and broadcasts
 * its event. The event statement must be the one at `eventIndex`.
 */
export async function commitChange(
  ctx: ServiceContext,
  statements: D1PreparedStatement[],
  eventIndex: number,
  event: Omit<BureauEvent, 'id' | 'auteur' | 'auteur_id' | 'declencheur' | 'annule_par'>,
): Promise<BureauEvent> {
  const results = await withConstraintErrors(() => ctx.db.batch<{ id: number }>(statements));
  const id = results[eventIndex]?.results[0]?.id;
  if (id === undefined) throw new Error('The event was not journalled');
  const journalled: BureauEvent = {
    ...event,
    id,
    auteur: ctx.auteur,
    auteur_id: ctx.auteurId ?? null,
    declencheur: ctx.declencheur ?? null,
    annule_par: null,
  };
  await ctx.broadcast(journalled);
  return journalled;
}

export async function createElement(
  ctx: ServiceContext,
  type: ElementType,
  input: unknown,
): Promise<ChangeResult> {
  const definition = getDefinition(type);
  if (!definition.createSchema) {
    throw new ServiceError('interdit', `${definition.label} : ce type ne se crée pas, il se modifie seulement.`);
  }
  const values = await applyCreateRules(ctx, definition, validate(definition.createSchema, input));

  const id = generateId(type);
  const horodatage = ctx.now().toISOString();
  const element: ElementRecord = { id };
  for (const [column, fallback] of Object.entries(definition.columns)) {
    element[column] = values[column] ?? fallback;
  }
  Object.assign(element, { cree_le: horodatage, modifie_le: horodatage, supprime_le: null });

  const columns = Object.keys(element);
  const statements = [
    ctx.db
      .prepare(
        `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .bind(...columns.map((column) => toColumnValue(definition, column, element[column]))),
  ];
  if (type === 'agent') statements.push(versionStatement(ctx, horodatage, id, element));
  statements.push(eventStatement(ctx, horodatage, 'creation', definition, id, null, element));

  const event = await commitChange(ctx, statements, statements.length - 1, {
    horodatage,
    type: 'creation',
    type_cible: type,
    id_cible: id,
    avant: null,
    apres: element,
  });
  return { element, event };
}

export interface ApplyOptions {
  /** Event being undone: it is marked as such in the same transaction. */
  undoneEventId?: number;
}

/**
 * Writes changed fields on an existing element and journals them. Shared by
 * updates, deletions, restorations and undos. `changes` must already be valid.
 */
export async function applyChanges(
  ctx: ServiceContext,
  definition: ElementDefinition,
  before: ElementRecord,
  changes: ElementRecord,
  eventType: EventType,
  options: ApplyOptions = {},
): Promise<ChangeResult> {
  // Keep only what really changes, so the journal stays exact and undo precise.
  const changed = Object.keys(changes).filter(
    (key) => JSON.stringify(changes[key] ?? null) !== JSON.stringify(before[key] ?? null),
  );
  if (changed.length === 0) return { element: before, event: null };

  const id = String(before[definition.idColumn]);
  const horodatage = ctx.now().toISOString();
  const avant = Object.fromEntries(changed.map((key) => [key, before[key] ?? null]));
  const apres = Object.fromEntries(changed.map((key) => [key, changes[key] ?? null]));
  const element: ElementRecord = { ...before, ...apres, modifie_le: horodatage };

  const statements = [
    ctx.db
      .prepare(
        `UPDATE ${definition.table} SET ${changed.map((key) => `${key} = ?`).join(', ')}, modifie_le = ?
         WHERE ${definition.idColumn} = ?`,
      )
      .bind(...changed.map((key) => toColumnValue(definition, key, apres[key])), horodatage, id),
  ];
  if (definition.type === 'agent' && (changed.includes('fonction') || changed.includes('consignes'))) {
    statements.push(versionStatement(ctx, horodatage, id, element));
  }
  statements.push(eventStatement(ctx, horodatage, eventType, definition, id, avant, apres));
  const eventIndex = statements.length - 1;
  if (options.undoneEventId !== undefined) {
    statements.push(
      ctx.db
        .prepare('UPDATE events SET annule_par = (SELECT MAX(id) FROM events) WHERE id = ?')
        .bind(options.undoneEventId),
    );
  }

  const event = await commitChange(ctx, statements, eventIndex, {
    horodatage,
    type: eventType,
    type_cible: definition.type,
    id_cible: id,
    avant,
    apres,
  });
  return { element, event };
}

export async function updateElement(
  ctx: ServiceContext,
  type: ElementType,
  id: string,
  patch: unknown,
): Promise<ChangeResult> {
  const definition = getDefinition(type);
  const before = await readElement(ctx, type, id);
  const changes = await applyUpdateRules(ctx, definition, before, validate(definition.patchSchema, patch));
  return applyChanges(ctx, definition, before, changes, 'modification');
}

/** Sends an element to the trash, where it stays 30 days. */
export async function deleteElement(ctx: ServiceContext, type: ElementType, id: string): Promise<ChangeResult> {
  const definition = getDefinition(type);
  if (!definition.lifecycle) {
    throw new ServiceError('interdit', `${definition.label} : ce type ne se supprime pas.`);
  }
  const before = await readElement(ctx, type, id);
  applyDeleteRules(definition, before);
  return applyChanges(ctx, definition, before, { supprime_le: ctx.now().toISOString() }, 'suppression');
}

/** Takes an element out of the trash. */
export async function restoreElement(ctx: ServiceContext, type: ElementType, id: string): Promise<ChangeResult> {
  const definition = getDefinition(type);
  const before = await readElement(ctx, type, id, { includeDeleted: true });
  if (!before.supprime_le) {
    throw new ServiceError('conflit', `${definition.label} ${id} n'est pas dans la corbeille.`);
  }
  return applyChanges(ctx, definition, before, { supprime_le: null }, 'restauration');
}
