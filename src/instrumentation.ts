/**
 * Next.js Instrumentation hook (P1-PROD-7).
 *
 * Runs once per server instance at startup. Used to:
 *   - Register graceful shutdown handlers (SIGTERM/SIGINT)
 *   - Pre-warm critical resources
 *   - Run startup health checks
 *   - Own module-scope setInterval handles (P2-PERF-15)
 *
 * The Node.js-only logic lives in `src/lib/instrumentation-node.ts` and is
 * dynamically imported here so the Edge runtime parser never sees the
 * `process.on` / `process.pid` calls (which would otherwise emit Edge
 * Runtime warnings on every cold start).
 *
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamically import the Node-only module so the Edge parser doesn't
  // bundle process.* calls into the Edge bundle.
  await import("./lib/instrumentation-node").then((mod) => mod.register());
}
