/**
 * Read-only views that complete the generic element services: the furniture
 * catalogue and the version history of an agent.
 */
import type { ElementRecord } from '../../shared/schemas/elements';
import type { ServiceContext } from './context';
import { readElement } from './elements';

/** Furniture models that can be placed in rooms, with their shapes and colours. */
export async function listCatalogue(ctx: ServiceContext): Promise<ElementRecord[]> {
  const { results } = await ctx.db
    .prepare('SELECT * FROM catalogue_meubles ORDER BY categorie, nom')
    .all<Record<string, unknown>>();
  return results.map((row) => ({
    ...row,
    variantes: JSON.parse(row.variantes as string) as string[],
    coloris: JSON.parse(row.coloris as string) as string[],
    bloquant: row.bloquant === 1,
  }));
}

/** Successive roles and instructions of an agent, latest first. */
export async function listAgentVersions(ctx: ServiceContext, agentId: string): Promise<ElementRecord[]> {
  await readElement(ctx, 'agent', agentId, { includeDeleted: true });
  const { results } = await ctx.db
    .prepare(
      'SELECT version, fonction, consignes, auteur, cree_le FROM agent_versions WHERE agent_id = ? ORDER BY version DESC',
    )
    .bind(agentId)
    .all<Record<string, unknown>>();
  return results;
}
