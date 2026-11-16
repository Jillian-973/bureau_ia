import { json } from './http';
import { createLiveContext, getBureau } from './realtime';
import { emptyTrash } from './services/trash';

export { Bureau } from './do/bureau';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/ws') return getBureau(env).fetch(request);

    return env.ASSETS.fetch(request);
  },

  /** Daily housekeeping: empties the trash of what was deleted more than 30 days ago. */
  async scheduled(_controller, env): Promise<void> {
    await emptyTrash(createLiveContext(env, { auteur: 'systeme' }));
  },
} satisfies ExportedHandler<Env>;
