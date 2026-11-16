import { SELF, env } from 'cloudflare:test';
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

export const TEST_ORIGIN = 'https://bureau.test';

/** Posts the login form like a browser would. Each caller should use its own address. */
export function postLogin(password: string, address: string, next?: string): Promise<Response> {
  return SELF.fetch(`${TEST_ORIGIN}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'CF-Connecting-IP': address, Origin: TEST_ORIGIN },
    body: new URLSearchParams({ mot_de_passe: password, ...(next === undefined ? {} : { next }) }),
  });
}

/** Logs in with the test password and returns the `Cookie` header to send afterwards. */
export async function login(address = '203.0.113.200'): Promise<string> {
  const response = await postLogin(env.BUREAU_PASSWORD, address);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`Login failed with status ${response.status}`);
  return cookie;
}

export const countRows = async (table: string, where = '1 = 1'): Promise<number> =>
  (await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`).first<{ total: number }>())
    ?.total ?? 0;
