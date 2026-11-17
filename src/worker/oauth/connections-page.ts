/**
 * `/connexions`: a small page, behind the office password, to see which
 * clients may connect to the MCP server, register one for a tool such as
 * MCP Inspector, and disconnect a client. Plain HTML forms, no script.
 */
import { isSameOrigin } from '../auth/routes';
import { ServiceError } from '../services/errors';
import {
  createOAuthClient,
  deleteOAuthClient,
  listGrants,
  listOAuthClients,
  revokeGrant,
} from './connections';
import type { OAuthClientSummary } from './connections';
import { oauthHelpers } from './helpers';

const INSPECTOR_CALLBACK = 'http://localhost:6274/oauth/callback';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: #0b1026; color: #f4f6ff;
    font: 14px/1.5 ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace; }
  main { max-width: 760px; margin: 0 auto; display: grid; gap: 16px; }
  section { padding: 16px 18px; background: linear-gradient(180deg, #1c2a6a 0%, #131c44 100%);
    border: 2px solid #e8ecff; border-radius: 8px; box-shadow: 0 0 0 2px #0b1026; }
  h1 { margin: 0; font-size: 18px; color: #ffd66b; }
  h2 { margin: 0 0 10px; font-size: 15px; color: #ffd66b; }
  p { margin: 0 0 10px; }
  .muted { color: #a9b3e0; }
  .notice { padding: 8px 10px; border: 1px solid #ffd66b; border-radius: 5px; }
  .error { padding: 8px 10px; border: 1px solid #ff9d8a; border-radius: 5px; color: #ffc2b5; }
  code { padding: 1px 4px; background: rgb(0 0 0 / 30%); border-radius: 3px; word-break: break-all; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  li { display: flex; gap: 10px; align-items: center; justify-content: space-between;
    padding: 8px 10px; border: 1px solid rgb(232 236 255 / 25%); border-radius: 5px; }
  li > div { min-width: 0; }
  label { display: block; margin: 8px 0 4px; color: #a9b3e0; }
  input { width: 100%; padding: 8px 10px; border: 1px solid #e8ecff; border-radius: 5px;
    background: #0b1026; color: inherit; font: inherit; }
  button { padding: 7px 12px; border: 1px solid #e8ecff; border-radius: 5px; background: rgb(232 236 255 / 12%);
    color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
  button:hover { background: rgb(232 236 255 / 24%); }
  .row { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-top: 12px; }
  a { color: #ffd66b; }
  :focus-visible { outline: 2px solid #ffd66b; outline-offset: 2px; }
`;

interface PageState {
  origin: string;
  clients: OAuthClientSummary[];
  grants: Awaited<ReturnType<typeof listGrants>>;
  notice?: string;
  error?: string;
  status?: number;
}

function render({ origin, clients, grants, notice, error, status = 200 }: PageState): Response {
  const clientNames = new Map(clients.map((client) => [client.client_id, client.nom]));
  const clientList =
    clients.length === 0
      ? '<p class="muted">Aucun client pré-enregistré.</p>'
      : `<ul>${clients
          .map(
            (client) => `<li><div><strong>${escapeHtml(client.nom)}</strong><br>
  <span class="muted">Identifiant :</span> <code>${escapeHtml(client.client_id)}</code><br>
  <span class="muted">Retour :</span> ${client.adresses_retour.map((uri) => `<code>${escapeHtml(uri)}</code>`).join(' ')}</div>
  <form method="post" action="/connexions"><input type="hidden" name="action" value="supprimer_client">
  <input type="hidden" name="id" value="${escapeHtml(client.client_id)}"><button type="submit">Supprimer</button></form></li>`,
          )
          .join('')}</ul>`;

  const grantList =
    grants.length === 0
      ? '<p class="muted">Aucune application connectée.</p>'
      : `<ul>${grants
          .map((grant) => {
            const name = clientNames.get(grant.client_id) ?? grant.client_id;
            return `<li><div><strong>${escapeHtml(name)}</strong><br>
  <span class="muted">Autorisée le ${escapeHtml(grant.autorise_le.slice(0, 16).replace('T', ' '))} (UTC)</span></div>
  <form method="post" action="/connexions"><input type="hidden" name="action" value="revoquer">
  <input type="hidden" name="id" value="${escapeHtml(grant.id)}"><button type="submit">Déconnecter</button></form></li>`;
          })
          .join('')}</ul>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>Connexions — Bureau d'agents IA</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <section>
    <h1>Connexions au serveur MCP</h1>
    <p class="muted">Adresse du connecteur : <code>${escapeHtml(`${origin}/mcp`)}</code> · <a href="/">Retour au bureau</a></p>
    ${notice ? `<p class="notice" role="status">${notice}</p>` : ''}
    ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
  </section>
  <section>
    <h2>Applications connectées</h2>
    ${grantList}
  </section>
  <section>
    <h2>Clients pré-enregistrés</h2>
    <p class="muted">Claude se connecte avec son identité publiée : rien à créer pour lui. Ajoute un client ici pour un outil qui ne la gère pas, comme MCP Inspector.</p>
    ${clientList}
    <form method="post" action="/connexions">
      <input type="hidden" name="action" value="creer_client">
      <div class="row">
        <div style="flex: 1 1 180px"><label for="nom">Nom</label>
          <input id="nom" name="nom" required maxlength="60" value="MCP Inspector"></div>
        <div style="flex: 2 1 280px"><label for="adresse_retour">Adresse de retour</label>
          <input id="adresse_retour" name="adresse_retour" required maxlength="500" value="${INSPECTOR_CALLBACK}"></div>
        <button type="submit">Créer</button>
      </div>
    </form>
  </section>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** The caller has already checked that the user is logged in to the office. */
export async function handleConnections(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const oauth = oauthHelpers(env);
  const state = async (extra: Partial<PageState> = {}): Promise<PageState> => ({
    origin,
    clients: await listOAuthClients(oauth),
    grants: await listGrants(oauth),
    ...extra,
  });

  if (request.method === 'GET') return render(await state());
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  if (!isSameOrigin(request)) return new Response('Origine refusée', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const id = String(form.get('id') ?? '');
  try {
    if (action === 'creer_client') {
      const client = await createOAuthClient(oauth, {
        nom: String(form.get('nom') ?? ''),
        adresse_retour: String(form.get('adresse_retour') ?? ''),
      });
      return render(
        await state({
          notice: `Client créé. Identifiant à coller dans l'outil : <code>${escapeHtml(client.client_id)}</code> (pas de secret).`,
        }),
      );
    }
    if (action === 'supprimer_client') {
      await deleteOAuthClient(oauth, id);
      return render(await state({ notice: 'Client supprimé, ses accès sont révoqués.' }));
    }
    if (action === 'revoquer') {
      await revokeGrant(oauth, id);
      return render(await state({ notice: 'Application déconnectée.' }));
    }
    return render(await state({ error: 'Action inconnue.', status: 400 }));
  } catch (error) {
    if (error instanceof ServiceError) return render(await state({ error: error.message, status: error.status }));
    throw error;
  }
}
