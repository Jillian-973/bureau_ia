import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Two test projects:
 * - `unit`: pure logic (shared rules, scene maths), run by Node.js;
 * - `worker`: services, authentication and routes, run inside the Workers
 *   runtime with local bindings.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              // Test-only values: the real secrets live outside the repository.
              bindings: {
                BUREAU_PASSWORD: 'test-password-for-vitest',
                SESSION_SECRET: 'test-session-secret-for-vitest-0123456789',
              },
            },
          }),
        ],
        test: {
          name: 'worker',
          include: ['tests/worker/**/*.test.ts'],
        },
      },
    ],
  },
});
