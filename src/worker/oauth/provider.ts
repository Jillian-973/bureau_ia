/**
 * OAuth 2.1 for the MCP endpoint, with `@cloudflare/workers-oauth-provider` in
 * its single-Worker form: this Worker is both the authorization server and
 * the only protected resource (`/mcp`).
 *
 * Client registration: Client ID Metadata Documents (Claude's published
 * identity) and pre-registered clients. Dynamic Client Registration is
 * deprecated by MCP 2026-07-28 and stays disabled.
 */
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import type { OAuthProviderOptions } from '@cloudflare/workers-oauth-provider';
import { app } from '../app';
import { mcpApiHandler } from '../mcp/server';

export const MCP_PATH = '/mcp';

/**
 * Options for one public origin. The resource identifier and the issuer are
 * the origin the office is reached at (workers.dev while testing, the custom
 * domain in production, localhost in development).
 */
export function oauthOptions(origin: string): OAuthProviderOptions<Env> {
  return {
    apiRoute: MCP_PATH,
    apiHandler: mcpApiHandler,
    defaultHandler: app,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      resource_name: "Bureau d'agents IA",
    },
  };
}

const providers = new Map<string, OAuthProvider<Env> | null>();

/**
 * The provider for the origin of a request, built once per origin. Requests
 * only reach this Worker on its own hostnames (Cloudflare routes them), so the
 * origin is one of ours. Null when the origin cannot be an OAuth resource
 * (plain http on a non-local host).
 */
export function getProvider(origin: string): OAuthProvider<Env> | null {
  if (!providers.has(origin)) {
    try {
      providers.set(origin, new OAuthProvider<Env>(oauthOptions(origin)));
    } catch (error) {
      console.error(`OAuth is unavailable on ${origin}`, error);
      providers.set(origin, null);
    }
  }
  return providers.get(origin) ?? null;
}
