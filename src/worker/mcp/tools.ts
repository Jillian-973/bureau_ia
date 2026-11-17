/**
 * The chef's tools (section 5). Each one is a thin call to the service layer,
 * like the REST API, so the chef and the web page can do the same things with
 * the same result. Every call needs a valid `declencheur` and is journalled.
 */
import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ELEMENT_TYPES, MISSION_TYPES } from '../../shared/schemas/elements';
import type { ElementRecord, ElementType } from '../../shared/schemas/elements';
import type { Trigger } from '../../shared/schemas/events';
import { createLiveContext } from '../realtime';
import { listAgentVersions, listCatalogue } from '../services/catalogue';
import type { ServiceContext } from '../services/context';
import {
  createElement,
  deleteElement,
  listElements,
  readElement,
  restoreElement,
  updateElement,
} from '../services/elements';
import type { ChangeResult } from '../services/elements';
import { ServiceError } from '../services/errors';
import { listEvents, undoEvent } from '../services/events';
import { getBudgetState, getOfficeOverview } from '../services/overview';
import { confirmPermanentDeletion, requestPermanentDeletion } from '../services/trash';
import { compactElement, compactEvent, compactList } from './format';
import { recordToolCall } from './journal';
import { TOOL_DESCRIPTION_PREFIX, triggerParameter } from './trigger';

export interface ToolEnvironment {
  env: Env;
  /** Public origin of the office, to give the chef a link to the web page. */
  origin: string;
}

const id = z.string().trim().min(1).max(64);
const changeableTypes = ['agent', 'mission', 'tache', 'salle', 'meuble', 'avatar'] as const;
const readableTypes = [...ELEMENT_TYPES, 'theme', 'historique', 'catalogue'] as const;
const filterValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const text = (value: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

/** What a change returns to the chef: the fields that changed and the event that undoes it. */
function changeSummary({ element, event }: ChangeResult): ElementRecord {
  if (!event) return { message: 'Aucun changement : les valeurs étaient déjà celles-ci.' };
  return compactElement({
    id: element.id ?? element.cle,
    avant: event.avant ? compactElement(event.avant) : null,
    apres: event.apres ? compactElement(event.apres) : null,
    evenement: event.id,
  });
}

function defineTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  tools: ToolEnvironment,
  name: string,
  config: { title: string; description: string; annotations: ToolAnnotations; input: Shape },
  run: (args: z.infer<z.ZodObject<Shape>>, ctx: ServiceContext) => Promise<unknown>,
): void {
  const inputSchema = z.object({ declencheur: triggerParameter, ...config.input });
  server.registerTool(
    name,
    {
      title: config.title,
      description: `${TOOL_DESCRIPTION_PREFIX} ${config.description}`,
      inputSchema,
      annotations: { title: config.title, ...config.annotations },
    },
    async ({ declencheur: trigger, ...args }: Record<string, unknown>) => {
      const started = Date.now();
      const declencheur = trigger as Trigger;
      const ctx = createLiveContext(tools.env, { auteur: 'chef', declencheur });
      try {
        // The trigger is journalled through the context; the tool only gets its own arguments.
        const result = await run(args as z.infer<z.ZodObject<Shape>>, ctx);
        await recordToolCall(tools.env.DB, { outil: name, declencheur, succes: true, dureeMs: Date.now() - started });
        return text(result);
      } catch (error) {
        const message =
          error instanceof ServiceError ? error.message : 'Erreur interne du bureau. Réessaie dans un instant.';
        if (!(error instanceof ServiceError)) console.error(`Tool ${name} failed`, error);
        await recordToolCall(tools.env.DB, {
          outil: name,
          declencheur,
          succes: false,
          erreur: message,
          dureeMs: Date.now() - started,
        });
        return text(message, true);
      }
    },
  );
}

export function registerTools(server: McpServer, tools: ToolEnvironment): void {
  defineTool(
    server,
    tools,
    'bureau_lire',
    {
      title: 'Lire le bureau',
      description:
        "Lit un élément (avec id) ou une liste filtrée. Types : agent, mission, tache, salle, meuble, avatar, reglage, theme, historique (journal, pour trouver l'événement à annuler), catalogue (meubles).",
      annotations: READ_ONLY,
      input: {
        type: z.enum(readableTypes),
        id: id.optional().describe('Élément précis ; pour historique, filtre sur la cible.'),
        filtres: z
          .record(z.string(), filterValue)
          .optional()
          .describe('Égalités sur des colonnes, ex. {"statut":"ouverte"}. Historique : type_cible.'),
        corbeille: z.boolean().optional().describe('Lire la corbeille au lieu des éléments actifs.'),
        versions: z.boolean().optional().describe("Avec type agent et id : ajoute l'historique de ses fonctions."),
        limite: z.int().min(1).max(200).optional(),
      },
    },
    async ({ type, id: elementId, filtres, corbeille, versions, limite }, ctx) => {
      if (type === 'theme') return { theme: (await readElement(ctx, 'reglage', 'theme')).valeur };
      if (type === 'catalogue') return compactList('catalogue', await listCatalogue(ctx));
      if (type === 'historique') {
        const typeCible = typeof filtres?.type_cible === 'string' ? filtres.type_cible : undefined;
        const events = await listEvents(ctx, { type_cible: typeCible, id_cible: elementId, limite: limite ?? 20 });
        return events.map(compactEvent);
      }
      if (elementId) {
        const element = compactElement(await readElement(ctx, type, elementId, { includeDeleted: corbeille }));
        if (type === 'agent' && versions) element.versions = (await listAgentVersions(ctx, elementId)).slice(0, limite ?? 10);
        return element;
      }
      return compactList(type, await listElements(ctx, type, { filters: filtres, corbeille, limite: limite ?? 50 }));
    },
  );

  defineTool(
    server,
    tools,
    'bureau_creer',
    {
      title: 'Créer un élément',
      description:
        'Crée un agent, une mission, une tâche, une salle, un meuble ou un avatar. Les champs de donnees suivent la base (ex. salle : type, nom, position_x, position_y, largeur, profondeur).',
      annotations: WRITE,
      input: {
        type: z.enum(changeableTypes),
        donnees: z.record(z.string(), z.unknown()).describe('Champs du nouvel élément.'),
      },
    },
    async ({ type, donnees }, ctx) => {
      const { element, event } = await createElement(ctx, type, donnees);
      return { cree: compactElement(element), evenement: event?.id };
    },
  );

  defineTool(
    server,
    tools,
    'bureau_modifier',
    {
      title: 'Modifier un élément',
      description:
        'Modifie un élément par un correctif partiel. Réglage : id = clé, correctif {"valeur": …}. Thème : correctif {"valeur": …}, sans id.',
      annotations: WRITE,
      input: {
        type: z.enum([...ELEMENT_TYPES, 'theme']),
        id: id.optional(),
        correctif: z.record(z.string(), z.unknown()).describe('Seulement les champs à changer.'),
      },
    },
    async ({ type, id: elementId, correctif }, ctx) => {
      if (type === 'theme') return changeSummary(await updateElement(ctx, 'reglage', 'theme', correctif));
      if (!elementId) throw new ServiceError('validation', 'id : champ obligatoire pour ce type.');
      return changeSummary(await updateElement(ctx, type, elementId, correctif));
    },
  );

  defineTool(
    server,
    tools,
    'bureau_supprimer',
    {
      title: 'Supprimer un élément',
      description:
        "Envoie un élément à la corbeille (annulable 30 jours). Suppression définitive, seulement depuis la corbeille : definitif=true renvoie un jeton ; demande l'accord de l'utilisateur, puis rappelle avec ce jeton.",
      annotations: DESTRUCTIVE,
      input: {
        type: z.enum(changeableTypes),
        id,
        definitif: z.boolean().optional(),
        jeton: z.string().min(1).max(200).optional().describe('Jeton reçu pour confirmer la suppression définitive.'),
      },
    },
    async ({ type, id: elementId, definitif, jeton }, ctx) => {
      if (jeton) {
        const event = await confirmPermanentDeletion(ctx, jeton);
        return { supprime_definitivement: `${event.type_cible}:${event.id_cible}`, evenement: event.id };
      }
      if (definitif) {
        const request = await requestPermanentDeletion(ctx, type, elementId);
        return {
          ...request,
          consigne:
            "Demande à l'utilisateur de confirmer, puis rappelle bureau_supprimer avec ce jeton. Cette suppression ne s'annule pas.",
        };
      }
      const { event } = await deleteElement(ctx, type, elementId);
      return { corbeille: `${type}:${elementId}`, evenement: event?.id };
    },
  );

  defineTool(
    server,
    tools,
    'bureau_restaurer',
    {
      title: 'Restaurer un élément',
      description: 'Sort un élément de la corbeille.',
      annotations: WRITE,
      input: { type: z.enum(changeableTypes), id },
    },
    async ({ type, id: elementId }, ctx) => changeSummary(await restoreElement(ctx, type, elementId)),
  );

  defineTool(
    server,
    tools,
    'historique_annuler',
    {
      title: 'Annuler une action',
      description: "Annule un événement du journal (id lu avec bureau_lire type historique). L'annulation s'annule aussi.",
      annotations: WRITE,
      input: { evenement_id: z.int().positive() },
    },
    async ({ evenement_id }, ctx) => changeSummary(await undoEvent(ctx, evenement_id)),
  );

  defineTool(
    server,
    tools,
    'bureau_afficher',
    {
      title: 'Afficher le bureau',
      description: "Ouvre la vue du bureau : agents, missions en cours, salles et lien vers la page web. Pour « /bureau » seul.",
      annotations: READ_ONLY,
      input: {},
    },
    async (_args, ctx) => ({ ...(await getOfficeOverview(ctx)), page_web: `${tools.origin}/` }),
  );

  defineTool(
    server,
    tools,
    'mission_ouvrir',
    {
      title: 'Ouvrir une mission',
      description: 'Crée une mission avant de déléguer ses tâches.',
      annotations: WRITE,
      input: {
        titre: z.string().trim().min(1).max(120),
        type: z.enum(MISSION_TYPES),
        brief: z.string().trim().max(8000).optional(),
      },
    },
    async (input, ctx) => {
      const { element, event } = await createElement(ctx, 'mission', input);
      return { mission_id: element.id, evenement: event?.id };
    },
  );

  defineTool(
    server,
    tools,
    'mission_cloturer',
    {
      title: 'Clôturer une mission',
      description: 'Clôture une mission avec son bilan.',
      annotations: WRITE,
      input: { mission_id: id, bilan: z.string().trim().min(1).max(8000) },
    },
    async ({ mission_id, bilan }, ctx) =>
      changeSummary(await updateElement(ctx, 'mission', mission_id, { statut: 'cloturee', bilan })),
  );

  defineTool(
    server,
    tools,
    'tache_deleguer',
    {
      title: 'Déléguer une tâche',
      description:
        "Confie une tâche à un agent : brief, format de retour, case privée. Une tâche privée ne va jamais à Gemini (offre gratuite).",
      annotations: WRITE,
      input: {
        mission_id: id,
        agent_id: id,
        brief: z.string().trim().min(1).max(8000),
        format_retour: z.string().trim().max(500).optional().describe('Forme attendue du livrable.'),
        privee: z.boolean().optional(),
      },
    },
    async ({ mission_id, agent_id, brief, format_retour, privee }, ctx) => {
      const { element, event } = await createElement(ctx, 'tache', {
        mission_id,
        agent_id,
        brief: format_retour ? `${brief}\n\nFormat de retour : ${format_retour}` : brief,
        privee,
      });
      return {
        tache_id: element.id,
        statut: element.statut,
        evenement: event?.id,
        note: "Tâche enregistrée en attente : l'exécution par les agents IA n'est pas encore active.",
      };
    },
  );

  defineTool(
    server,
    tools,
    'tache_resultat',
    {
      title: "Résultat d'une tâche",
      description: 'Lit le résumé court d’une tâche ; complet=true pour le livrable complet, seulement si nécessaire.',
      annotations: READ_ONLY,
      input: { tache_id: id, complet: z.boolean().optional() },
    },
    async ({ tache_id, complet }, ctx) => {
      const task = await readElement(ctx, 'tache', tache_id);
      const summary = compactElement({
        tache_id: task.id,
        agent_id: task.agent_id,
        statut: task.statut,
        resume: task.resume,
        erreur: task.erreur,
        cout: task.cout,
        livrable: task.cle_livrable_r2,
      });
      if (complet && !task.cle_livrable_r2) summary.livrable_complet = 'Pas encore de livrable complet pour cette tâche.';
      return summary;
    },
  );

  defineTool(
    server,
    tools,
    'agent_modifier_fonction',
    {
      title: "Changer la fonction d'un agent",
      description: "Change la fonction et/ou les consignes d'un agent. Chaque changement crée une version restaurable.",
      annotations: WRITE,
      input: {
        agent_id: id,
        fonction: z.string().trim().min(1).max(500).optional(),
        consignes: z.string().trim().max(8000).optional(),
      },
    },
    async ({ agent_id, fonction, consignes }, ctx) => {
      const patch: ElementRecord = {};
      if (fonction !== undefined) patch.fonction = fonction;
      if (consignes !== undefined) patch.consignes = consignes;
      const summary = changeSummary(await updateElement(ctx, 'agent', agent_id, patch));
      const [latest] = await listAgentVersions(ctx, agent_id);
      return { ...summary, version: latest?.version };
    },
  );

  defineTool(
    server,
    tools,
    'agent_creer_sous_agent',
    {
      title: 'Créer un sous-agent',
      description: 'Crée un sous-agent sous un agent existant, avec le même fournisseur, sa fonction et son avatar.',
      annotations: WRITE,
      input: {
        parent_id: id,
        nom: z.string().trim().min(1).max(60),
        fonction: z.string().trim().min(1).max(500),
        consignes: z.string().trim().max(8000).optional(),
        pseudo: z.string().trim().min(1).max(40).optional(),
      },
    },
    async (input, ctx) => {
      const parent = await readElement(ctx, 'agent', input.parent_id);
      const agent = await createElement(ctx, 'agent', { ...input, salle_bureau_id: parent.salle_bureau_id });
      const agentId = String(agent.element.id);
      // Rule 7 of section 4: a sub-agent has its own avatar.
      const avatar = await createElement(ctx, 'avatar', { agent_id: agentId });
      await updateElement(ctx, 'agent', agentId, { avatar_id: avatar.element.id });
      return {
        agent_id: agentId,
        fournisseur: agent.element.fournisseur,
        avatar_id: avatar.element.id,
        evenement: agent.event?.id,
      };
    },
  );

  defineTool(
    server,
    tools,
    'budget_etat',
    {
      title: 'État du budget',
      description: 'Dépenses du mois et plafonds par fournisseur.',
      annotations: READ_ONLY,
      input: {},
    },
    async (_args, ctx) => ({
      ...(await getBudgetState(ctx)),
      quotas_gratuits: 'Non mesurés pour le moment.',
    }),
  );
}

/** Element types the chef can change, for tests and documentation. */
export const CHANGEABLE_TYPES: readonly ElementType[] = changeableTypes;
