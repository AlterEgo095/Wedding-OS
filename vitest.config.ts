import { defineConfig } from 'vitest/config';
import path from 'node:path';

// ━━━ V4 — Testing Foundation (P0-C) ━━━
// Vitest configuration — run with `bunx vitest` or `npx vitest`.
// Scope: unit + integration tests against the real lib/ modules.
// Database: tests use an in-memory SQLite (per-test isolation) seeded by
// prisma/seed.ts gated behind SEED_DEMO_DATA=test.
//
// CRITICAL — these tests DO NOT touch production.
//   - No NETWORK calls (no /api fetches)
//   - No production DB (DATABASE_URL override at setup)
//   - No Redis (in-memory fallback is exercised by withRateLimit)

export default defineConfig({
  // V4.7 — disable CSS processing so vitest doesn't try to load the project's
  // postcss.config.mjs (which references @tailwindcss/postcss as a string,
  // incompatible with Vite's CSS pipeline when running pure-TS unit tests).
  css: false,
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/auth.ts', 'src/lib/guest-auth.ts',
                'src/lib/prisma-extensions/tenant-scoped.ts',
                'src/lib/commercial/pricing-engine.ts',
                'src/lib/rate-limit.ts'],
    },
    // Performance gate — fail slow tests so perf regressions surface early.
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
