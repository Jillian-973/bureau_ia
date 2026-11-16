/**
 * The login page, rendered by the Worker itself so that nothing of the
 * interface is served before the password. User-facing text is in French.
 */

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export interface LoginPageOptions {
  /** Path to return to after a successful login. */
  next: string;
  /** Error shown above the form, if any. */
  error?: string;
  status?: number;
}

export function renderLoginPage({ next, error, status = 200 }: LoginPageOptions): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>Connexion — Bureau d'agents IA</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: #0b1026; color: #f4f6ff;
    font: 15px ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace;
  }
  main {
    width: 100%; max-width: 340px; padding: 22px;
    background: linear-gradient(180deg, #1c2a6a 0%, #131c44 100%);
    border: 2px solid #e8ecff; border-radius: 8px;
    box-shadow: 0 0 0 2px #0b1026, 0 6px 18px rgb(0 0 0 / 45%);
  }
  h1 { margin: 0 0 16px; font-size: 18px; color: #ffd66b; }
  label { display: block; margin-bottom: 6px; color: #a9b3e0; }
  input {
    width: 100%; padding: 9px 10px; border: 1px solid #e8ecff; border-radius: 5px;
    background: #0b1026; color: inherit; font: inherit;
  }
  button {
    width: 100%; margin-top: 14px; padding: 9px 10px; border: 1px solid #e8ecff; border-radius: 5px;
    background: rgb(232 236 255 / 12%); color: inherit; font: inherit; cursor: pointer;
  }
  button:hover { background: rgb(232 236 255 / 24%); }
  :focus-visible { outline: 2px solid #ffd66b; outline-offset: 2px; }
  .error { margin: 0 0 14px; padding: 8px 10px; border: 1px solid #ff9d8a; border-radius: 5px; color: #ffc2b5; }
</style>
</head>
<body>
<main>
  <h1>Bureau d'agents IA</h1>
  ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="mot_de_passe">Mot de passe</label>
    <input id="mot_de_passe" name="mot_de_passe" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Entrer</button>
  </form>
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
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}
