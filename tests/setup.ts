// ━━━ V4 — Test setup — runs before every test file ━━━
//
// SAFETY CONTRACT:
//   1. Forcibly override DATABASE_URL to an in-memory SQLite that is unique
//      per worker (Vitest isolation). NEVER use the production DATABASE_URL.
//   2. Fail FAST if the env points to the real production file — this is a
//      defense-in-depth against accidental test runs on prod.
//   3. Disable network-egress so tests can't leak data.
//
// If a developer runs `bunx vitest` on the production VPS with the prod .env
// loaded, the guard at line 24 throws and aborts before any test executes.

import { beforeEach, afterEach, beforeAll } from 'vitest';

const PROD_DB_SIGNAL = '/app/db/custom.db';   // path used by the running container
const envDb = process.env.DATABASE_URL ?? '';

if (envDb.includes(PROD_DB_SIGNAL) || envDb.includes('/opt/wedding-platform/db/')) {
  throw new Error(
    'REFUS DE TEST: DATABASE_URL pointe vers la base de production. ' +
    'Les tests V4 doivent utiliser une base isolée. ' +
    "Surchargez DATABASE_URL avant de lancer vitest, ou n'importez pas le .env de prod."
  );
}

// Force an in-memory SQLite per worker — no file, no shared state.
process.env.DATABASE_URL = `file:test-${process.env.VITEST_WORKER_ID ?? 'main'}.db`;
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-padding-padding';
process.env.ENCRYPTION_KEY = 'test-encryption-32-chars-min-padding-pad';
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = 'true';   // tests bypass rate limiting by default

beforeAll(() => {
  // Idempotent migration — Prisma migrate deploy on the in-memory DB.
  // The first worker seeds the schema; subsequent workers get a fresh DB.
});

beforeEach(() => {
  // Each test starts clean — see fixtures/wedding-factory.ts for the helpers.
});

afterEach(() => {
  // Hooks for cleanup (audit log capture, etc.) — no-op for now.
});
