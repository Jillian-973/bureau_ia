/**
 * Business rules applied on top of the validation schemas, because they need
 * to look at other elements (a parent agent, a room, the catalogue…).
 */
import { REGLAGE_KEYS, REGLAGE_VALUE_SCHEMAS, describeValidationError } from '../../shared/schemas/elements';
import type { ElementRecord, ReglageKey } from '../../shared/schemas/elements';
import type { ServiceContext } from './context';
import { DEFINITIONS, fromRow } from './definitions';
import type { ElementDefinition } from './definitions';
import { ServiceError } from './errors';

/** Reads a live (not in the trash) element needed by a rule, or fails with a clear message. */
async function requireLive(
  ctx: ServiceContext,
  definition: ElementDefinition,
  id: unknown,
): Promise<ElementRecord> {
  const row = await ctx.db
    .prepare(`SELECT * FROM ${definition.table} WHERE id = ? AND supprime_le IS NULL`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new ServiceError('validation', `${definition.label} introuvable : ${String(id)}`);
  return fromRow(definition, row);
}

function refuseGeminiPrivate(fournisseur: unknown, acceptePrive: unknown): void {
  if (fournisseur === 'gemini' && acceptePrive === true) {
    throw new ServiceError(
      'validation',
      "Un agent Gemini (offre gratuite) ne peut pas accepter de tâches privées : ses données peuvent servir à l'entraînement.",
    );
  }
}

/** Shape and colour must exist in the catalogue, and the footprint must fit inside the room. */
async function checkFurniture(ctx: ServiceContext, furniture: ElementRecord): Promise<ElementRecord> {
  const model = await ctx.db
    .prepare('SELECT * FROM catalogue_meubles WHERE modele_id = ?')
    .bind(furniture.modele_id)
    .first<{ variantes: string; coloris: string; empreinte_largeur: number; empreinte_profondeur: number }>();
  if (!model) {
    throw new ServiceError('validation', `Modèle de meuble inconnu : ${String(furniture.modele_id)}`);
  }
  const shapes = JSON.parse(model.variantes) as string[];
  const colours = JSON.parse(model.coloris) as string[];
  const checked: ElementRecord = {
    ...furniture,
    variante: furniture.variante ?? shapes[0],
    coloris: furniture.coloris ?? colours[0],
  };
  if (!shapes.includes(checked.variante as string)) {
    throw new ServiceError('validation', `Variante inconnue. Choix possibles : ${shapes.join(', ')}`);
  }
  if (!colours.includes(checked.coloris as string)) {
    throw new ServiceError('validation', `Coloris inconnu. Choix possibles : ${colours.join(', ')}`);
  }

  const room = await requireLive(ctx, DEFINITIONS.salle, checked.salle_id);
  const turned = checked.rotation === 90 || checked.rotation === 270;
  const width = turned ? model.empreinte_profondeur : model.empreinte_largeur;
  const depth = turned ? model.empreinte_largeur : model.empreinte_profondeur;
  const x = checked.x as number;
  const y = checked.y as number;
  if (x + width > (room.largeur as number) || y + depth > (room.profondeur as number)) {
    throw new ServiceError(
      'validation',
      `Le meuble dépasse de la salle « ${String(room.nom)} » (${String(room.largeur)} × ${String(room.profondeur)} cases).`,
    );
  }
  return checked;
}

/** Completes and checks the values of a new element. */
export async function applyCreateRules(
  ctx: ServiceContext,
  definition: ElementDefinition,
  input: ElementRecord,
): Promise<ElementRecord> {
  switch (definition.type) {
    case 'agent': {
      let fournisseur = input.fournisseur;
      if (input.parent_id) {
        // Rule 7 of section 4: a sub-agent uses the provider of its parent.
        const parent = await requireLive(ctx, DEFINITIONS.agent, input.parent_id);
        if (fournisseur && fournisseur !== parent.fournisseur) {
          throw new ServiceError(
            'validation',
            `Un sous-agent utilise le fournisseur de son parent (${String(parent.fournisseur)}).`,
          );
        }
        fournisseur = parent.fournisseur;
      }
      if (!fournisseur) throw new ServiceError('validation', 'fournisseur : champ obligatoire');
      refuseGeminiPrivate(fournisseur, input.accepte_prive);
      return { ...input, fournisseur };
    }
    case 'tache': {
      const mission = await requireLive(ctx, DEFINITIONS.mission, input.mission_id);
      if (mission.statut !== 'ouverte') {
        throw new ServiceError('conflit', 'Cette mission est clôturée : rouvre-la pour y ajouter une tâche.');
      }
      await requireLive(ctx, DEFINITIONS.agent, input.agent_id);
      return input;
    }
    case 'meuble':
      return checkFurniture(ctx, { rotation: 0, ...input });
    case 'avatar':
      await requireLive(ctx, DEFINITIONS.agent, input.agent_id);
      return input;
    default:
      return input;
  }
}

/** Completes and checks a change. `before` is the element as it is now. */
export async function applyUpdateRules(
  ctx: ServiceContext,
  definition: ElementDefinition,
  before: ElementRecord,
  patch: ElementRecord,
): Promise<ElementRecord> {
  switch (definition.type) {
    case 'agent':
      refuseGeminiPrivate(before.fournisseur, patch.accepte_prive);
      return patch;
    case 'mission':
      // Closing a mission dates it; reopening clears the date.
      if (patch.statut === 'cloturee' && before.statut !== 'cloturee') {
        return { ...patch, cloturee_le: ctx.now().toISOString() };
      }
      if (patch.statut === 'ouverte' && before.statut !== 'ouverte') {
        return { ...patch, cloturee_le: null };
      }
      return patch;
    case 'tache':
      if (patch.agent_id !== undefined) await requireLive(ctx, DEFINITIONS.agent, patch.agent_id);
      return patch;
    case 'meuble': {
      const checked = await checkFurniture(ctx, { ...before, ...patch });
      return Object.fromEntries(Object.keys(patch).map((key) => [key, checked[key]]));
    }
    case 'reglage': {
      const key = before.cle as ReglageKey;
      if (!REGLAGE_KEYS.includes(key)) throw new ServiceError('validation', `Réglage inconnu : ${key}`);
      const result = REGLAGE_VALUE_SCHEMAS[key].safeParse(patch.valeur);
      if (!result.success) {
        throw new ServiceError('validation', `valeur : ${describeValidationError(result.error)}`);
      }
      return { valeur: result.data };
    }
    default:
      return patch;
  }
}

/** Refuses deletions that would break the office. */
export function applyDeleteRules(definition: ElementDefinition, element: ElementRecord): void {
  if (definition.type === 'agent' && element.fournisseur === 'claude') {
    throw new ServiceError('interdit', 'Le chef ne peut pas être supprimé.');
  }
}
