import type { D1Migration } from 'cloudflare:test';

// Extra binding injected by vitest.config.ts for the tests only.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
