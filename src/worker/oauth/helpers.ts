import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

/** There is a single user. The id must not contain ":" (used inside tokens). */
export const OWNER_USER_ID = 'proprietaire';

/** Helpers that `OAuthProvider` adds to the environment of its default handler. */
export function oauthHelpers(env: Env): OAuthHelpers {
  const helpers = (env as Env & { OAUTH_PROVIDER?: OAuthHelpers }).OAUTH_PROVIDER;
  if (!helpers) throw new Error('OAUTH_PROVIDER is missing: this route must be served through OAuthProvider');
  return helpers;
}
