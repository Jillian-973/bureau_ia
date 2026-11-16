import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Two test projects:
 * - `unit`: pure logic (shared rules, scene maths), run by Node.js;
 * - `worker`: services, authentication and routes, run inside the Workers
 *   runtime with local bindings and a database built from the migrations.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
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
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  // Test-only values: the real secrets live outside the repository.
                  BUREAU_PASSWORD: 'test-password-for-vitest',
                  SESSION_SECRET: 'test-session-secret-for-vitest-0123456789',
                },
              },
            }),
          ],
          test: {
            name: 'worker',
            include: ['tests/worker/**/*.test.ts'],
            setupFiles: ['./tests/worker/setup.ts'],
          },
        },
      ],
    },
  };
});
