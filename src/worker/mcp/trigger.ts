/**
 * The office is only used when the user's last message contains "@bureau"
 * or "/bureau" (section 5, "Déclenchement"). The server cannot read the
 * conversation, so it relies on four levels; these texts are levels 1 and 2.
 */
import { z } from 'zod';
import { TRIGGERS } from '../../shared/schemas/events';

/** Server `instructions` field (level 1). */
export const SERVER_INSTRUCTIONS = [
  "Règle : n'utilise aucun outil de ce serveur si le dernier message de l'utilisateur ne contient pas « @bureau » ou « /bureau », même pour une simple lecture.",
  "Sans déclencheur, réponds normalement sans le bureau ; s'il serait utile, suggère-le en une phrase.",
  'Le déclencheur vaut pour le message où il apparaît : pour poursuivre une mission au message suivant, il faut qu’il y soit à nouveau.',
  'Passe à chaque outil le paramètre declencheur avec le mot trouvé dans le message.',
  '« /bureau » seul : appelle bureau_afficher. « @bureau » ou « /bureau » suivi d’une demande : traite la demande (mission_ouvrir, tache_deleguer, bureau_modifier…).',
  'Réponses compactes : lis le détail complet seulement si tu en as besoin.',
].join('\n');

/** Short reminder that starts every tool description (level 1). */
export const TOOL_DESCRIPTION_PREFIX = 'Seulement si le dernier message contient @bureau ou /bureau.';

/** Message returned when a call carries no valid trigger (level 2). */
export const MISSING_TRIGGER_MESSAGE =
  "Appel refusé : le bureau ne s'utilise que si le dernier message de l'utilisateur contient « @bureau » ou « /bureau ». Indique ce mot dans declencheur, sinon réponds sans le bureau.";

/** The mandatory `declencheur` parameter of every tool (level 2). */
export const triggerParameter = z
  .enum(TRIGGERS, { error: MISSING_TRIGGER_MESSAGE })
  .describe("Mot déclencheur présent dans le dernier message de l'utilisateur : « @bureau » ou « /bureau ».");
