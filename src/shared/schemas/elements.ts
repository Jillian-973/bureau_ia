/**
 * Validation schemas of everything that can be created or changed in the
 * office. They are shared: the MCP tools, the REST API and the interface all
 * validate with the same rules. Field names follow the database (French).
 */
import { z } from 'zod';
import { fr } from 'zod/locales';

// Validation messages are shown to the user, so they are in French.
z.config(fr());

export const ELEMENT_TYPES = ['agent', 'mission', 'tache', 'salle', 'meuble', 'avatar', 'reglage'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
export const elementTypeSchema = z.enum(ELEMENT_TYPES);

export const PROVIDERS = ['claude', 'gemini', 'deepseek'] as const;
export const AGENT_STATUSES = ['disponible', 'occupe', 'inactif'] as const;
export const MISSION_TYPES = [
  'recherche',
  'cadrage',
  'conception',
  'dev',
  'marketing',
  'communication',
  'perso',
] as const;
export const MISSION_STATUSES = ['ouverte', 'cloturee'] as const;
export const TASK_STATUSES = ['en_attente', 'en_cours', 'terminee', 'echouee'] as const;
export const ROOM_TYPES = ['bureau', 'open_space', 'reunion', 'cafeteria', 'pause', 'jeux'] as const;
export const SILHOUETTES = ['petite', 'moyenne', 'grande'] as const;
export const ROTATIONS = [0, 90, 180, 270] as const;

const id = z.string().trim().min(1).max(64);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const longText = (max: number) => z.string().trim().max(max);
const jsonObject = z.record(z.string(), z.unknown());
const cell = z.int().min(0).max(200);
const roomSide = z.int().min(3).max(40);

/** A change must name at least one field. */
const patchOf = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z
    .strictObject(shape)
    .partial()
    .refine((value) => Object.keys(value).length > 0, { message: 'Indique au moins un champ à modifier' });

export const agentCreateSchema = z.strictObject({
  /** Set to create a sub-agent: it then uses the provider of its parent. */
  parent_id: id.nullish(),
  fournisseur: z.enum(PROVIDERS).optional(),
  modele: shortText(100).nullish(),
  nom: shortText(60),
  pseudo: shortText(40).nullish(),
  fonction: shortText(500),
  consignes: longText(8000).optional(),
  accepte_prive: z.boolean().optional(),
  avatar_id: id.nullish(),
  salle_bureau_id: id.nullish(),
});

export const agentPatchSchema = patchOf({
  modele: shortText(100).nullable(),
  nom: shortText(60),
  pseudo: shortText(40).nullable(),
  fonction: shortText(500),
  consignes: longText(8000),
  accepte_prive: z.boolean(),
  statut: z.enum(AGENT_STATUSES),
  avatar_id: id.nullable(),
  salle_bureau_id: id.nullable(),
});

export const missionCreateSchema = z.strictObject({
  titre: shortText(120),
  type: z.enum(MISSION_TYPES),
  brief: longText(8000).optional(),
});

export const missionPatchSchema = patchOf({
  titre: shortText(120),
  type: z.enum(MISSION_TYPES),
  brief: longText(8000),
  statut: z.enum(MISSION_STATUSES),
  bilan: longText(8000).nullable(),
});

export const tacheCreateSchema = z.strictObject({
  mission_id: id,
  agent_id: id,
  brief: shortText(8000),
  privee: z.boolean().optional(),
});

export const tachePatchSchema = patchOf({
  agent_id: id,
  brief: shortText(8000),
  privee: z.boolean(),
  statut: z.enum(TASK_STATUSES),
  resume: longText(1500).nullable(),
  cle_livrable_r2: shortText(300).nullable(),
  tokens_entree: z.int().min(0).nullable(),
  tokens_sortie: z.int().min(0).nullable(),
  cout: z.number().min(0).nullable(),
  duree_ms: z.int().min(0).nullable(),
  erreur: longText(2000).nullable(),
});

const salleFields = {
  type: z.enum(ROOM_TYPES),
  nom: shortText(60),
  position_x: z.int().min(-500).max(500),
  position_y: z.int().min(-500).max(500),
  largeur: roomSide,
  profondeur: roomSide,
  decor: jsonObject,
};

export const salleCreateSchema = z.strictObject({ ...salleFields, decor: jsonObject.optional() });
export const sallePatchSchema = patchOf(salleFields);

export const meubleCreateSchema = z.strictObject({
  salle_id: id,
  modele_id: id,
  /** Defaults to the first shape and colour of the catalogue model. */
  variante: shortText(40).optional(),
  coloris: shortText(40).optional(),
  x: cell,
  y: cell,
  rotation: z.literal(ROTATIONS).optional(),
});

export const meublePatchSchema = patchOf({
  salle_id: id,
  variante: shortText(40),
  coloris: shortText(40),
  x: cell,
  y: cell,
  rotation: z.literal(ROTATIONS),
});

const avatarFields = {
  silhouette: z.enum(SILHOUETTES),
  calques: jsonObject,
  couleurs: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format #rrggbb')),
  personnalite: shortText(40),
  emploi_du_temps: jsonObject,
};

export const avatarCreateSchema = z.strictObject({ agent_id: id }).extend(z.strictObject(avatarFields).partial().shape);
export const avatarPatchSchema = patchOf(avatarFields);

/** Settings are a fixed list of keys; each key has its own value type. */
export const REGLAGE_VALUE_SCHEMAS = {
  nom_bureau: shortText(60),
  qualite_graphique: z.enum(['auto', 'elevee', 'moyenne', 'basse']),
  theme: shortText(40),
  /** Rule 2 of section 4: private tasks may go to DeepSeek only if allowed here. */
  prive_vers_deepseek: z.boolean(),
  plafond_mensuel_deepseek: z.number().min(0).nullable(),
  plafond_par_mission: z.number().min(0).nullable(),
} as const;

export type ReglageKey = keyof typeof REGLAGE_VALUE_SCHEMAS;
export const REGLAGE_KEYS = Object.keys(REGLAGE_VALUE_SCHEMAS) as ReglageKey[];

export const reglagePatchSchema = z.strictObject({ valeur: z.unknown() });

export type AgentCreate = z.infer<typeof agentCreateSchema>;
export type AgentPatch = z.infer<typeof agentPatchSchema>;
export type MissionCreate = z.infer<typeof missionCreateSchema>;
export type MissionPatch = z.infer<typeof missionPatchSchema>;
export type TacheCreate = z.infer<typeof tacheCreateSchema>;
export type TachePatch = z.infer<typeof tachePatchSchema>;
export type SalleCreate = z.infer<typeof salleCreateSchema>;
export type SallePatch = z.infer<typeof sallePatchSchema>;
export type MeubleCreate = z.infer<typeof meubleCreateSchema>;
export type MeublePatch = z.infer<typeof meublePatchSchema>;
export type AvatarCreate = z.infer<typeof avatarCreateSchema>;
export type AvatarPatch = z.infer<typeof avatarPatchSchema>;

/** An element as returned to clients: database row with booleans and JSON decoded. */
export type ElementRecord = Record<string, unknown>;

/** Turns validation issues into one readable French sentence. */
export function describeValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')} : ${issue.message}` : issue.message))
    .join(' ; ');
}
