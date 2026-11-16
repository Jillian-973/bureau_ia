import { createServiceContext } from './services/context';
import type { ServiceContext, ServiceContextOptions } from './services/context';

/** There is one office, so one Durable Object instance, always found by this name. */
const BUREAU_INSTANCE = 'bureau';

export function getBureau(env: Env) {
  return env.BUREAU.getByName(BUREAU_INSTANCE);
}

/**
 * Service context for a real request: changes are journalled in D1 and
 * pushed to every open view through the Bureau Durable Object.
 */
export function createLiveContext(
  env: Env,
  options: Omit<ServiceContextOptions, 'broadcast'>,
): ServiceContext {
  return createServiceContext(env.DB, {
    ...options,
    broadcast: async (event) => {
      await getBureau(env).broadcast(event);
    },
  });
}
