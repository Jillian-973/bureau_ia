/**
 * How each element type maps to its table. This is the only place that knows
 * column names: SQL is always built from these lists, never from user input.
 */
import type { z } from 'zod';
import {
  agentCreateSchema,
  agentPatchSchema,
  avatarCreateSchema,
  avatarPatchSchema,
  meubleCreateSchema,
  meublePatchSchema,
  missionCreateSchema,
  missionPatchSchema,
  reglagePatchSchema,
  salleCreateSchema,
  sallePatchSchema,
  tacheCreateSchema,
  tachePatchSchema,
} from '../../shared/schemas/elements';
import type { ElementRecord, ElementType } from '../../shared/schemas/elements';

export interface ElementDefinition {
  type: ElementType;
  /** French name used in messages. */
  label: string;
  table: string;
  idColumn: 'id' | 'cle';
  /** Data columns with the value a new element gets when none is given. */
  columns: Readonly<Record<string, unknown>>;
  jsonColumns: readonly string[];
  booleanColumns: readonly string[];
  /** Columns that lists can be filtered on. */
  filterColumns: readonly string[];
  /** Null when elements of this type cannot be created. */
  createSchema: z.ZodType<ElementRecord> | null;
  patchSchema: z.ZodType<ElementRecord>;
  /** Whether the type has `cree_le` and a trash (`supprime_le`). */
  lifecycle: boolean;
}

export const DEFINITIONS: Record<ElementType, ElementDefinition> = {
  agent: {
    type: 'agent',
    label: 'Agent',
    table: 'agents',
    idColumn: 'id',
    columns: {
      parent_id: null,
      fournisseur: null,
      modele: null,
      nom: null,
      pseudo: null,
      fonction: null,
      consignes: '',
      accepte_prive: false,
      statut: 'disponible',
      avatar_id: null,
      salle_bureau_id: null,
      cout_cumule: 0,
    },
    jsonColumns: [],
    booleanColumns: ['accepte_prive'],
    filterColumns: ['parent_id', 'fournisseur', 'statut', 'salle_bureau_id'],
    createSchema: agentCreateSchema,
    patchSchema: agentPatchSchema,
    lifecycle: true,
  },
  mission: {
    type: 'mission',
    label: 'Mission',
    table: 'missions',
    idColumn: 'id',
    columns: { titre: null, type: null, statut: 'ouverte', brief: '', bilan: null, cloturee_le: null },
    jsonColumns: [],
    booleanColumns: [],
    filterColumns: ['type', 'statut'],
    createSchema: missionCreateSchema,
    patchSchema: missionPatchSchema,
    lifecycle: true,
  },
  tache: {
    type: 'tache',
    label: 'Tâche',
    table: 'taches',
    idColumn: 'id',
    columns: {
      mission_id: null,
      agent_id: null,
      brief: null,
      privee: false,
      statut: 'en_attente',
      resume: null,
      cle_livrable_r2: null,
      tokens_entree: null,
      tokens_sortie: null,
      cout: null,
      duree_ms: null,
      erreur: null,
    },
    jsonColumns: [],
    booleanColumns: ['privee'],
    filterColumns: ['mission_id', 'agent_id', 'statut', 'privee'],
    createSchema: tacheCreateSchema,
    patchSchema: tachePatchSchema,
    lifecycle: true,
  },
  salle: {
    type: 'salle',
    label: 'Salle',
    table: 'salles',
    idColumn: 'id',
    columns: {
      type: null,
      nom: null,
      position_x: null,
      position_y: null,
      largeur: null,
      profondeur: null,
      decor: {},
    },
    jsonColumns: ['decor'],
    booleanColumns: [],
    filterColumns: ['type'],
    createSchema: salleCreateSchema,
    patchSchema: sallePatchSchema,
    lifecycle: true,
  },
  meuble: {
    type: 'meuble',
    label: 'Meuble',
    table: 'meubles',
    idColumn: 'id',
    columns: { salle_id: null, modele_id: null, variante: null, coloris: null, x: null, y: null, rotation: 0 },
    jsonColumns: [],
    booleanColumns: [],
    filterColumns: ['salle_id', 'modele_id'],
    createSchema: meubleCreateSchema,
    patchSchema: meublePatchSchema,
    lifecycle: true,
  },
  avatar: {
    type: 'avatar',
    label: 'Avatar',
    table: 'avatars',
    idColumn: 'id',
    columns: {
      agent_id: null,
      silhouette: 'moyenne',
      calques: {},
      couleurs: {},
      personnalite: 'bosseur',
      emploi_du_temps: {},
    },
    jsonColumns: ['calques', 'couleurs', 'emploi_du_temps'],
    booleanColumns: [],
    filterColumns: ['agent_id'],
    createSchema: avatarCreateSchema,
    patchSchema: avatarPatchSchema,
    lifecycle: true,
  },
  reglage: {
    type: 'reglage',
    label: 'Réglage',
    table: 'reglages',
    idColumn: 'cle',
    columns: { valeur: null },
    jsonColumns: ['valeur'],
    booleanColumns: [],
    filterColumns: [],
    createSchema: null,
    patchSchema: reglagePatchSchema,
    lifecycle: false,
  },
};

/** Decodes a database row: JSON columns are parsed, 0/1 flags become booleans. */
export function fromRow(definition: ElementDefinition, row: Record<string, unknown>): ElementRecord {
  const record: ElementRecord = { ...row };
  for (const column of definition.jsonColumns) {
    if (typeof record[column] === 'string') record[column] = JSON.parse(record[column]);
  }
  for (const column of definition.booleanColumns) {
    if (record[column] !== null && record[column] !== undefined) record[column] = record[column] === 1;
  }
  return record;
}

/** Encodes one value for the database. */
export function toColumnValue(definition: ElementDefinition, column: string, value: unknown): unknown {
  // JSON columns always hold JSON text, `null` included (an unset setting, for instance).
  if (definition.jsonColumns.includes(column)) return JSON.stringify(value ?? null);
  if (value === undefined || value === null) return null;
  if (definition.booleanColumns.includes(column)) return value ? 1 : 0;
  return value;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short readable id such as `mission-k3x9q2ab`: cheap for the chef to read and repeat. */
export function generateId(type: ElementType): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
  return `${type}-${suffix}`;
}
