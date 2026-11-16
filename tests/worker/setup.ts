import { applyD1Migrations, env } from 'cloudflare:test';

// Every test file starts from a fresh database: schema plus initial data.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
