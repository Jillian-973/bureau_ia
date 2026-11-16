import { json } from './http';
import { createServiceContext } from './services/context';
import { emptyTrash } from './services/trash';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true });

    return env.ASSETS.fetch(request);
  },

  /** Daily housekeeping: empties the trash of what was deleted more than 30 days ago. */
  async scheduled(_controller, env): Promise<void> {
    await emptyTrash(createServiceContext(env.DB, { auteur: 'systeme' }));
  },
} satisfies ExportedHandler<Env>;
