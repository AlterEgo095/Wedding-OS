/**
 * Node.js-only instrumentation logic (P1-PROD-7 + P2-PERF-15 + P2.6).
 *
 * This module is dynamically imported from `src/instrumentation.ts` so the
 * Edge runtime never parses `process.on` / `process.pid` / `setInterval`.
 *
 * Owns:
 *  - SIGTERM/SIGINT graceful shutdown handlers
 *  - uncaughtException / unhandledRejection loggers
 *  - The 10-minute cleanup interval for guest lookup-token replay cache
 *    (P2-PERF-15: moved here from src/app/api/guest/auto-auth/route.ts)
 *  - The 60-minute cleanup interval for guest auth session cache
 *    (P2-PERF-15: moved here from src/lib/guest-auth.ts)
 *  - The 60-minute commercial lifecycle cron (P2.6: subscription state
 *    machine enforcement — TRIALING→PENDING_PAYMENT, PENDING_PAYMENT→SUSPENDED,
 *    PAST_DUE→SUSPENDED, SUSPENDED→CANCELLED + entitlements revocation)
 */

import { registerTokenReplayCacheCleanup, unregisterTokenReplayCacheCleanup } from "./guest-auth";
import { captureException } from "./sentry";
import { startCommercialCron } from "./commercial-cron";

let shuttingDown = false;
let intervals: ReturnType<typeof setInterval>[] = [];

async function shutdown(signal: "SIGTERM" | "SIGINT") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[instrumentation] Received ${signal}, shutting down gracefully...`);

  // Clear all owned intervals so the event loop can drain cleanly.
  for (const handle of intervals) clearInterval(handle);
  intervals = [];
  unregisterTokenReplayCacheCleanup();

  try {
    const { db } = await import("./db");
    await db.$disconnect();
    console.log("[instrumentation] Prisma disconnected.");
  } catch (err) {
    console.error("[instrumentation] Error during disconnect:", err);
  }

  setTimeout(() => {
    process.exit(signal === "SIGTERM" ? 0 : 130);
  }, 500);
}

export function register() {
  const ns = process.env.NODE_ENV;
  console.log(`[instrumentation] Wedding OS starting — env=${ns} pid=${process.pid}`);

  // ─── Module-scope intervals (P2-PERF-15) ────────────────────────────────
  // These cleanup intervals used to live at module-scope in lib/guest-auth.ts
  // and api/guest/auto-auth/route.ts. They are now owned here so they:
  //   (a) are cleared on SIGTERM (allowing graceful shutdown)
  //   (b) don't multiply under HMR in development
  intervals.push(registerTokenReplayCacheCleanup());

  // ─── Commercial lifecycle cron (P2.6) ───────────────────────────────────
  // Hourly scheduler that enforces the subscription state machine:
  //   TRIALING → PENDING_PAYMENT (trial expired)
  //   PENDING_PAYMENT → SUSPENDED (7 days stale)
  //   PAST_DUE → SUSPENDED (3 days — retry exhaustion)
  //   SUSPENDED → CANCELED + revoke entitlements (30 days)
  // startCommercialCron() is idempotent (module-level cronStarted guard).
  // The cron catches all errors internally and never crashes the server.
  try {
    startCommercialCron();
  } catch (err) {
    // Non-fatal — log and continue. The cron is best-effort automation.
    console.error("[instrumentation] Failed to start commercial cron:", err);
  }

  // ─── Graceful shutdown ──────────────────────────────────────────────────
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // ─── Uncaught error handlers ────────────────────────────────────────────
  process.on("uncaughtException", (err) => {
    captureException(err, { source: "uncaughtException" });
    process.exitCode = 1;
  });

  process.on("unhandledRejection", (reason) => {
    captureException(reason, { source: "unhandledRejection" });
    process.exitCode = 1;
  });
}
