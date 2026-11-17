/**
 * Who may connect to the office's MCP server.
 *
 * - Claude connects with its published identity (a Client ID Metadata
 *   Document): nothing to register here.
 * - Other clients, such as MCP Inspector, use a client registered in advance
 *   ("identifiants pré-enregistrés"). Dynamic registration stays disabled.
 * - Each accepted connection is a grant, which can be revoked here.
 */
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';
import { describeValidationError } from '../../shared/schemas/elements';
import { ServiceError } from '../services/errors';
import { OWNER_USER_ID } from './helpers';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** OAuth 2.1 accepts HTTPS redirects, or plain HTTP to an app on this computer. */
const redirectUriSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.hash || url.username || url.password) return false;
      return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
    } catch {
      return false;
    }
  }, 'Adresse de retour attendue en https://, ou en http://localhost pour une application locale');

export const oauthClientCreateSchema = z.strictObject({
  nom: z.string().trim().min(1).max(60),
  adresse_retour: redirectUriSchema,
});

export interface OAuthClientSummary {
  client_id: string;
  nom: string;
  adresses_retour: string[];
  cree_le: string | null;
}

export interface GrantSummaryFr {
  id: string;
  client_id: string;
  autorise_le: string;
  expire_le: string | null;
}

const isoFromSeconds = (seconds: number | undefined) =>
  seconds === undefined ? null : new Date(seconds * 1000).toISOString();

export async function listOAuthClients(oauth: OAuthHelpers): Promise<OAuthClientSummary[]> {
  const { items } = await oauth.listClients({ limit: 100 });
  return items.map((client) => ({
    client_id: client.clientId,
    nom: client.clientName ?? client.clientId,
    adresses_retour: client.redirectUris,
    cree_le: isoFromSeconds(client.registrationDate),
  }));
}

/** Registers a public client (PKCE, no secret): the only kind MCP clients need here. */
export async function createOAuthClient(oauth: OAuthHelpers, input: unknown): Promise<OAuthClientSummary> {
  const parsed = oauthClientCreateSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('validation', describeValidationError(parsed.error));
  const client = await oauth.createClient({
    clientName: parsed.data.nom,
    redirectUris: [parsed.data.adresse_retour],
    tokenEndpointAuthMethod: 'none',
  });
  return {
    client_id: client.clientId,
    nom: parsed.data.nom,
    adresses_retour: client.redirectUris,
    cree_le: isoFromSeconds(client.registrationDate),
  };
}

/** Deletes a client and revokes everything it was given. */
export async function deleteOAuthClient(oauth: OAuthHelpers, clientId: string): Promise<void> {
  if (!(await oauth.lookupClient(clientId).catch(() => null))) {
    throw new ServiceError('introuvable', `Client OAuth introuvable : ${clientId}`);
  }
  await oauth.deleteClient(clientId);
}

export async function listGrants(oauth: OAuthHelpers): Promise<GrantSummaryFr[]> {
  const { items } = await oauth.listUserGrants(OWNER_USER_ID, { limit: 100 });
  return items.map((grant) => ({
    id: grant.id,
    client_id: grant.clientId,
    autorise_le: isoFromSeconds(grant.createdAt) ?? '',
    expire_le: isoFromSeconds(grant.expiresAt),
  }));
}

/** Disconnects a client: its tokens stop working. */
export async function revokeGrant(oauth: OAuthHelpers, grantId: string): Promise<void> {
  const grants = await listGrants(oauth);
  if (!grants.some((grant) => grant.id === grantId)) {
    throw new ServiceError('introuvable', `Accès introuvable : ${grantId}`);
  }
  await oauth.revokeGrant(grantId, OWNER_USER_ID);
}
