/**
 * `/authorize`: where Claude sends the user to connect the office. The user
 * proves who they are with the office password (the existing session), then
 * approves or refuses the connection on the consent page.
 */
import { AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { isSameOrigin } from '../auth/routes';
import { renderAuthorizeError, renderConsentPage } from './consent-page';
import { OWNER_USER_ID, oauthHelpers } from './helpers';

async function showConsent(request: Request, oauth: OAuthHelpers): Promise<Response> {
  const authRequest = await oauth.parseAuthRequest(request);
  // describeConsent first: a failed lookup leaves nothing in storage.
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  consent.headers.set('content-type', 'text/html; charset=utf-8');
  consent.headers.set('cache-control', 'no-store');
  return new Response(renderConsentPage(details, consent.handle), { headers: consent.headers });
}

async function answerConsent(request: Request, oauth: OAuthHelpers): Promise<Response> {
  const form = await request.formData();
  const handle = String(form.get('handle') ?? '');

  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  const approved = await oauth.approveConsent(request, handle, { scope: form.getAll('scope').map(String) });
  const { redirectTo } = await oauth.completeAuthorization({
    // The approved request comes from storage, never from the form.
    request: approved.request,
    userId: OWNER_USER_ID,
    metadata: { autorise_le: new Date().toISOString() },
    scope: approved.request.scope,
    props: { utilisateur: OWNER_USER_ID },
  });
  approved.headers.set('Location', redirectTo);
  return new Response(null, { status: 302, headers: approved.headers });
}

/** The caller has already checked that the user is logged in to the office. */
export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  }
  if (request.method === 'POST' && !isSameOrigin(request)) {
    return renderAuthorizeError('Requête refusée : elle ne vient pas du bureau.', 403);
  }

  try {
    const oauth = oauthHelpers(env);
    return request.method === 'GET' ? await showConsent(request, oauth) : await answerConsent(request, oauth);
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) {
      // The client and its redirect URI were validated: the error can go back to it.
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError) {
      return renderAuthorizeError(
        `La demande de connexion n'est pas valide (${error.description ?? error.message}). Relance la connexion depuis Claude.`,
        400,
      );
    }
    if (error instanceof CimdFetchError) {
      return renderAuthorizeError("L'application qui demande l'accès n'a pas pu être vérifiée.", 400);
    }
    throw error;
  }
}
