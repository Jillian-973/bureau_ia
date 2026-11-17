/**
 * Consent page shown when Claude (or another MCP client) asks to connect to
 * the office. It shows what the MCP authorization spec requires: the client's
 * name, its verified domain, where the access will be sent, and a warning for
 * local apps. Every value coming from the client is escaped.
 */
import type { ConsentDescription } from '@cloudflare/workers-oauth-provider';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: #0b1026; color: #f4f6ff;
    font: 15px/1.5 ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace;
  }
  main {
    width: 100%; max-width: 440px; padding: 22px;
    background: linear-gradient(180deg, #1c2a6a 0%, #131c44 100%);
    border: 2px solid #e8ecff; border-radius: 8px;
    box-shadow: 0 0 0 2px #0b1026, 0 6px 18px rgb(0 0 0 / 45%);
  }
  h1 { margin: 0 0 14px; font-size: 18px; color: #ffd66b; }
  p { margin: 0 0 12px; }
  strong { color: #ffd66b; }
  .muted { color: #a9b3e0; }
  .warning { padding: 8px 10px; border: 1px solid #ff9d8a; border-radius: 5px; color: #ffc2b5; }
  .actions { display: flex; gap: 10px; margin-top: 18px; }
  button {
    flex: 1; padding: 9px 10px; border: 1px solid #e8ecff; border-radius: 5px;
    background: rgb(232 236 255 / 12%); color: inherit; font: inherit; cursor: pointer;
  }
  button[value='approve'] { border-color: #ffd66b; color: #ffd66b; }
  button:hover { background: rgb(232 236 255 / 24%); }
  :focus-visible { outline: 2px solid #ffd66b; outline-offset: 2px; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>${escapeHtml(title)} — Bureau d'agents IA</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export function renderConsentPage(details: ConsentDescription, handle: string): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? `<p>Publiée par <strong>${escapeHtml(details.clientDomain)}</strong>.</p>`
    : '<p class="muted">Cette application s’est enregistrée elle-même : son nom n’est pas vérifié.</p>';
  const loopback = details.redirectIsLoopback
    ? '<p class="warning">L’accès sera envoyé à une application sur cet ordinateur. Continue seulement si tu viens de lancer la connexion depuis elle.</p>'
    : '';
  const scopes =
    details.scope.length > 0
      ? `<p class="muted">Autorisations demandées : ${details.scope.map(escapeHtml).join(', ')}.</p>`
      : '';

  return page(
    'Autoriser une connexion',
    `<h1>Autoriser ${name} à utiliser le bureau ?</h1>
${origin}
<p>L’accès sera envoyé à <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${loopback}
${scopes}
<p class="muted">L’application pourra lire et modifier tout le bureau : agents, missions, salles, réglages.</p>
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  ${details.scope.map((scope) => `<input type="hidden" name="scope" value="${escapeHtml(scope)}">`).join('\n  ')}
  <div class="actions">
    <button type="submit" name="decision" value="deny">Refuser</button>
    <button type="submit" name="decision" value="approve">Autoriser</button>
  </div>
</form>`,
  );
}

/** Error shown on the office's own page, when it is not safe to send the user back to the client. */
export function renderAuthorizeError(message: string, status: number): Response {
  return new Response(
    page('Connexion impossible', `<h1>Connexion impossible</h1><p>${escapeHtml(message)}</p>`),
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
