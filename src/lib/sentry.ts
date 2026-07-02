// ══════════════════════════════════════════════════════════════════════════════
// src/lib/sentry.ts — P1-PROD-6: Lightweight error-reporting abstraction.
// ══════════════════════════════════════════════════════════════════════════════
//
// DESIGN: thin shim, opt-in Sentry wiring.
//
// The Wedding Platform does NOT bundle `@sentry/nextjs` by default — that
// package is ~600 KB minified, pulls in a non-trivial runtime, and has
// historically broken Next.js builds when the version lags behind Next.js
// releases. Instead this module exposes a tiny stable API
// (`captureException`, `captureMessage`) that today simply forwards to the
// structured `logger` (src/lib/logger.ts) — so errors still land in stdout
// as JSON lines, get picked up by the Docker json-file log driver, and can
// be grepped or shipped to Loki/CloudWatch.
//
// When the team is ready to adopt Sentry for real, the migration is ~5 lines:
//
//   1. `bun add @sentry/nextjs`
//   2. `bunx @sentry/wizard@latest -i nextjs` (or hand-write sentry.client.config.ts)
//   3. In this file, replace the logger fallback with:
//
//        import * as Sentry from '@sentry/nextjs';
//        export function captureException(error: unknown, context?: Record<string, unknown>) {
//          Sentry.captureException(error, { extra: context });
//        }
//        export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
//          Sentry.captureMessage(message, level === 'warning' ? 'warning' : level);
//        }
//
//   4. Set `SENTRY_DSN` in `.env` (see .env.example).
//   5. Optionally set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`
//      for source-map uploads during `next build`.
//
// Until then, every call to `captureException` lands in the structured logs
// as a JSON line tagged `msg: "sentry-capture"` so existing log queries
// keep working unchanged.
//
// WHY static `import` rather than lazy `require`:
//   - The project's ESLint config forbids `require()` (rule
//     `@typescript-eslint/no-require-imports`), so the lazy pattern would
//     require disable directives.
//   - `logger` is already imported across the codebase — adding it here
//     doesn't change the module graph. Node.js caches modules, so the
//     runtime cost is paid once at boot and shared by every caller.
//   - There's no circular-dependency risk: `logger.ts` does not import
//     `sentry.ts`.
// ══════════════════════════════════════════════════════════════════════════════

import { logger } from './logger';

/**
 * Capture an unexpected error. Today this forwards to `logger.error` so the
 * error lands in stdout JSON logs. When Sentry is wired up (see file header),
 * this will forward to `Sentry.captureException` instead.
 *
 * Accepts an optional `context` object whose entries are merged into the
 * log payload (and, in the future, into Sentry's `extra`).
 *
 * Usage:
 *   try { await riskyThing() }
 *   catch (err) { captureException(err, { userId, action: 'create-wedding' }) }
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  logger.error('sentry-capture', {
    errMessage: error instanceof Error ? error.message : String(error),
    errName: error instanceof Error ? error.name : 'Unknown',
    ...context,
  });
}

/**
 * Capture a free-form message. Useful for non-Error events that should still
 * surface in the error pipeline (e.g. "user hit a soft-deprecated endpoint").
 *
 * The `level` argument uses Sentry's vocabulary (`info` / `warning` / `error`)
 * rather than the logger's (`debug` / `info` / `warn` / `error`) so the
 * public API is forward-compatible with the eventual Sentry wiring.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  // Map Sentry level names → logger method names.
  if (level === 'error') {
    logger.error('sentry-message', { message });
  } else if (level === 'warning') {
    logger.warn('sentry-message', { message });
  } else {
    logger.info('sentry-message', { message });
  }
}
