/**
 * Entry point of the single Worker.
 *
 * - `/mcp`: the chef's MCP server, protected by OAuth
 * - `/.well-known/…`, `/oauth/token`: OAuth protocol routes (the provider's)
 * - everything else: see `app.ts` (login, `/authorize`, API, WebSocket, interface)
 */
import { app } from './app';
import { jsonError } from './http';
import { MCP_PATH, getProvider } from './oauth/provider';
import { createLiveContext } from './realtime';
import { emptyTrash } from './services/trash';

export { Bureau } from './do/bureau';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const provider = getProvider(url.origin);
    if (provider) return provider.fetch(request, env, ctx);

    // Without OAuth (plain http on a non-local address), the MCP server stays closed.
    if (url.pathname === MCP_PATH || url.pathname.startsWith(`${MCP_PATH}/`)) {
      return jsonError(503, 'oauth_indisponible', 'Le serveur MCP exige une adresse HTTPS.');
    }
    return app.fetch(request, env);
  },

  /** Daily housekeeping: empties the trash of what was deleted more than 30 days ago. */
  async scheduled(_controller, env): Promise<void> {
    await emptyTrash(createLiveContext(env, { auteur: 'systeme' }));
  },
} satisfies ExportedHandler<Env>;
