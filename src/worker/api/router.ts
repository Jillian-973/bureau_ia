/**
 * REST API of the web page. It is a thin layer: every route calls the service
 * layer, exactly like the MCP tools do, so both sides can do the same things
 * with the same result. Changes made here are authored by the user.
 */
import { isSameOrigin } from '../auth/routes';
import { json, jsonError } from '../http';
import { createLiveContext } from '../realtime';
import { listAgentVersions, listCatalogue } from '../services/catalogue';
import type { ServiceContext } from '../services/context';
import {
  createElement,
  deleteElement,
  getDefinition,
  listElements,
  readElement,
  restoreElement,
  updateElement,
} from '../services/elements';
import type { ListOptions } from '../services/elements';
import { ServiceError } from '../services/errors';
import { listEvents, undoEvent } from '../services/events';
import { getBudgetState, getOfficeOverview } from '../services/overview';
import { confirmPermanentDeletion, requestPermanentDeletion } from '../services/trash';

const MAX_BODY_BYTES = 64 * 1024;
/** Query parameters of a list that are options, not column filters. */
const LIST_OPTIONS = new Set(['corbeille', 'limite']);

function notFound(): Response {
  return jsonError(404, 'introuvable', 'Route inconnue.');
}

function methodNotAllowed(...allowed: string[]): Response {
  return jsonError(405, 'methode_refusee', `Méthode refusée. Méthodes possibles : ${allowed.join(', ')}.`);
}

function parseInteger(text: string | null, name: string): number | undefined {
  if (text === null || text === '') return undefined;
  if (!/^\d{1,9}$/.test(text)) throw new ServiceError('validation', `${name} : nombre entier attendu`);
  return Number(text);
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ServiceError('validation', 'Corps de requête attendu en JSON (Content-Type: application/json).');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ServiceError('validation', 'Corps de requête trop volumineux.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ServiceError('validation', 'Corps de requête JSON invalide.');
  }
}

/** Turns `?statut=ouverte&privee=true&corbeille=1` into list options. */
function readListOptions(type: string, params: URLSearchParams): ListOptions {
  const definition = getDefinition(type);
  const filters: NonNullable<ListOptions['filters']> = {};
  for (const [name, value] of params) {
    if (LIST_OPTIONS.has(name)) continue;
    if (value === 'null') filters[name] = null;
    else if (definition.booleanColumns.includes(name)) filters[name] = value === 'true' || value === '1';
    else filters[name] = value;
  }
  return {
    filters,
    corbeille: params.get('corbeille') === '1' || params.get('corbeille') === 'true',
    limite: parseInteger(params.get('limite'), 'limite'),
  };
}

async function route(request: Request, ctx: ServiceContext, segments: string[]): Promise<Response> {
  const { method } = request;
  const params = new URL(request.url).searchParams;
  const [resource, first, second, third] = segments;

  if (resource === 'session' && segments.length === 1) {
    return method === 'GET' ? json({ data: { connecte: true } }) : methodNotAllowed('GET');
  }

  if (resource === 'apercu' && segments.length === 1) {
    return method === 'GET' ? json({ data: await getOfficeOverview(ctx) }) : methodNotAllowed('GET');
  }

  if (resource === 'budget' && segments.length === 1) {
    return method === 'GET' ? json({ data: await getBudgetState(ctx) }) : methodNotAllowed('GET');
  }

  if (resource === 'catalogue' && segments.length === 1) {
    return method === 'GET' ? json({ data: await listCatalogue(ctx) }) : methodNotAllowed('GET');
  }

  if (resource === 'agents' && first && second === 'versions' && segments.length === 3) {
    return method === 'GET' ? json({ data: await listAgentVersions(ctx, first) }) : methodNotAllowed('GET');
  }

  if (resource === 'events') {
    if (segments.length === 1) {
      if (method !== 'GET') return methodNotAllowed('GET');
      const events = await listEvents(ctx, {
        apres: parseInteger(params.get('apres'), 'apres'),
        type_cible: params.get('type_cible') ?? undefined,
        id_cible: params.get('id_cible') ?? undefined,
        limite: parseInteger(params.get('limite'), 'limite'),
      });
      return json({ data: events });
    }
    if (first && second === 'undo' && segments.length === 3) {
      if (method !== 'POST') return methodNotAllowed('POST');
      const { element, event } = await undoEvent(ctx, parseInteger(first, 'id') ?? 0);
      return json({ data: element, event });
    }
    return notFound();
  }

  if (resource === 'purge' && first === 'confirm' && segments.length === 2) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request);
    const jeton = typeof body === 'object' && body !== null ? (body as { jeton?: unknown }).jeton : undefined;
    if (typeof jeton !== 'string' || jeton === '') throw new ServiceError('validation', 'jeton : champ obligatoire');
    return json({ event: await confirmPermanentDeletion(ctx, jeton) });
  }

  if (resource === 'elements' && first) {
    const type = getDefinition(first).type;

    if (segments.length === 2) {
      if (method === 'GET') return json({ data: await listElements(ctx, type, readListOptions(type, params)) });
      if (method === 'POST') {
        const { element, event } = await createElement(ctx, type, await readJsonBody(request));
        return json({ data: element, event }, { status: 201 });
      }
      return methodNotAllowed('GET', 'POST');
    }

    if (second && segments.length === 3) {
      if (method === 'GET') {
        const includeDeleted = params.get('corbeille') === '1' || params.get('corbeille') === 'true';
        return json({ data: await readElement(ctx, type, second, { includeDeleted }) });
      }
      if (method === 'PATCH') {
        const { element, event } = await updateElement(ctx, type, second, await readJsonBody(request));
        return json({ data: element, event });
      }
      if (method === 'DELETE') {
        const { element, event } = await deleteElement(ctx, type, second);
        return json({ data: element, event });
      }
      return methodNotAllowed('GET', 'PATCH', 'DELETE');
    }

    if (second && segments.length === 4) {
      if (third === 'restore') {
        if (method !== 'POST') return methodNotAllowed('POST');
        const { element, event } = await restoreElement(ctx, type, second);
        return json({ data: element, event });
      }
      if (third === 'purge') {
        if (method !== 'POST') return methodNotAllowed('POST');
        return json({ data: await requestPermanentDeletion(ctx, type, second) });
      }
    }
  }

  return notFound();
}

/** Entry point for `/api/*`. The caller has already checked the session. */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  // Changes are only accepted from our own pages, never from another site.
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOrigin(request)) {
    return jsonError(403, 'origine_refusee', 'Requête refusée : elle ne vient pas du bureau.');
  }

  try {
    const segments = new URL(request.url).pathname
      .split('/')
      .filter(Boolean)
      .slice(1)
      .map((segment) => decodeURIComponent(segment));
    return await route(request, createLiveContext(env, { auteur: 'utilisateur' }), segments);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.status, error.code, error.message);
    if (error instanceof URIError) return jsonError(400, 'validation', 'Adresse invalide.');
    console.error('Unexpected API error', error);
    return jsonError(500, 'erreur_interne', 'Erreur interne. Réessaie dans un instant.');
  }
}
