/**
 * Compact answers for the chef: every token counts against the Claude Pro
 * quota, so empty fields, bookkeeping dates and long texts are trimmed.
 */
import type { ElementRecord } from '../../shared/schemas/elements';
import type { BureauEvent } from '../../shared/schemas/events';

const BOOKKEEPING = new Set(['modifie_le']);

/** Fields shown per type in lists; a full read shows everything. */
const LIST_FIELDS: Record<string, readonly string[]> = {
  agent: ['id', 'nom', 'pseudo', 'fournisseur', 'modele', 'statut', 'parent_id', 'fonction'],
  mission: ['id', 'titre', 'type', 'statut', 'cree_le', 'cloturee_le'],
  tache: ['id', 'mission_id', 'agent_id', 'statut', 'privee', 'brief', 'resume'],
  salle: ['id', 'type', 'nom', 'position_x', 'position_y', 'largeur', 'profondeur'],
  meuble: ['id', 'salle_id', 'modele_id', 'variante', 'coloris', 'x', 'y', 'rotation'],
  avatar: ['id', 'agent_id', 'silhouette', 'personnalite'],
  reglage: ['cle', 'valeur'],
};

const LIST_TEXT_LIMIT = 120;

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function shorten(value: unknown, limit: number): unknown {
  return typeof value === 'string' && value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/** One element in full, without empty fields. */
export function compactElement(element: ElementRecord): ElementRecord {
  return Object.fromEntries(
    Object.entries(element).filter(([key, value]) => !BOOKKEEPING.has(key) && !isEmpty(value)),
  );
}

/** A list: only the useful fields of each type, long texts shortened. */
export function compactList(type: string, elements: ElementRecord[]): ElementRecord[] {
  const fields = LIST_FIELDS[type];
  return elements.map((element) => {
    const entries = fields ? fields.map((field) => [field, element[field]] as const) : Object.entries(element);
    const kept = entries
      .filter(([key, value]) => !BOOKKEEPING.has(key) && !isEmpty(value))
      .map(([key, value]) => [key, shorten(value, LIST_TEXT_LIMIT)]);
    // Trashed elements say so, since lists can show the trash.
    if (element.supprime_le) kept.push(['supprime_le', element.supprime_le]);
    return Object.fromEntries(kept);
  });
}

/** A journal event, as the chef needs it to understand or undo a change. */
export function compactEvent(event: BureauEvent): ElementRecord {
  return compactElement({
    id: event.id,
    horodatage: event.horodatage,
    auteur: event.auteur,
    type: event.type,
    cible: `${event.type_cible}:${event.id_cible}`,
    avant: event.avant ? compactElement(event.avant) : null,
    apres: event.apres ? compactElement(event.apres) : null,
    declencheur: event.declencheur,
    annule_par: event.annule_par,
  });
}
