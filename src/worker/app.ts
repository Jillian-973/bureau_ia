/**
 * Every route that is not the MCP endpoint nor an OAuth protocol route: the
 * login, the authorization page, the REST API, the WebSocket and the interface.
 */
import { handleApi } from './api/router';
import { handleLogin, handleLogout, isSameOrigin, requireSession } from './auth/routes';
import { json } from './http';
import { handleAuthorize } from './oauth/authorize';
import { getBureau } from './realtime';

export const app = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Public routes
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/login') return handleLogin(request, env);
    if (url.pathname === '/logout') return handleLogout(request);

    // Everything below needs the session opened by the password.
    const refusal = await requireSession(request, env);
    if (refusal) return refusal;

    if (url.pathname === '/authorize') return handleAuthorize(request, env);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);

    if (url.pathname === '/ws') {
      if (!isSameOrigin(request)) return new Response('Origine refusée', { status: 403 });
      return getBureau(env).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
