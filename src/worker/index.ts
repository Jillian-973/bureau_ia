import { handleLogin, handleLogout, isSameOrigin, requireSession } from './auth/routes';
import { json } from './http';
import { createLiveContext, getBureau } from './realtime';
import { emptyTrash } from './services/trash';

export { Bureau } from './do/bureau';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // Public routes
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/login') return handleLogin(request, env);
    if (url.pathname === '/logout') return handleLogout(request);

    // Everything below needs the session opened by the password.
    const refusal = await requireSession(request, env);
    if (refusal) return refusal;

    if (url.pathname === '/ws') {
      if (!isSameOrigin(request)) return new Response('Origine refusée', { status: 403 });
      return getBureau(env).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },

  /** Daily housekeeping: empties the trash of what was deleted more than 30 days ago. */
  async scheduled(_controller, env): Promise<void> {
    await emptyTrash(createLiveContext(env, { auteur: 'systeme' }));
  },
} satisfies ExportedHandler<Env>;
