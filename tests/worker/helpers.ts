import { env } from 'cloudflare:test';
import type { BureauEvent } from '../../src/shared/schemas/events';
import { createServiceContext } from '../../src/worker/services/context';
import type { ServiceContext, ServiceContextOptions } from '../../src/worker/services/context';

export interface TestContext {
  ctx: ServiceContext;
  /** Events the services asked to broadcast, in order. */
  broadcasts: BureauEvent[];
}

/** Service context on the test database that records what would be broadcast. */
export function createTestContext(options: Partial<ServiceContextOptions> = {}): TestContext {
  const broadcasts: BureauEvent[] = [];
  const ctx = createServiceContext(env.DB, {
    auteur: 'utilisateur',
    broadcast: async (event) => {
      broadcasts.push(event);
    },
    ...options,
  });
  return { ctx, broadcasts };
}

export const countRows = async (table: string, where = '1 = 1'): Promise<number> =>
  (await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`).first<{ total: number }>())
    ?.total ?? 0;
