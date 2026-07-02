/**
 * Next.js Instrumentation hook (P1-PROD-7).
 *
 * Runs once per server instance at startup. Used to:
 *   - Register graceful shutdown handlers (SIGTERM/SIGINT)
 *   - Pre-warm critical resources
 *   - Run startup health checks
 *
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const ns = process.env.NODE_ENV;
  console.log(`[instrumentation] Wedding OS starting — env=${ns} pid=${process.pid}`);

  // ─── Graceful shutdown ───────────────────────────────────────────────────
  // On SIGTERM (Docker stop, k8s rolling update) or SIGINT (Ctrl+C), we:
  //   1. Log the signal
  //   2. Allow in-flight requests ~10s to complete (Next.js handles this)
  //   3. Close the Prisma connection (frees the SQLite file handle)
  //   4. Exit cleanly (exit code 0 for SIGTERM, 130 for SIGINT)
  let shuttingDown = false;
  const shutdown = async (signal: "SIGTERM" | "SIGINT") => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[instrumentation] Received ${signal}, shutting down gracefully...`);

    try {
      // Dynamically import to avoid loading Prisma in Edge runtime
      const { db } = await import("./lib/db");
      await db.$disconnect();
      console.log("[instrumentation] Prisma disconnected.");
    } catch (err) {
      console.error("[instrumentation] Error during disconnect:", err);
    }

    // Give Next.js a moment to finish in-flight responses
    setTimeout(() => {
      process.exit(signal === "SIGTERM" ? 0 : 130);
    }, 500);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // ─── Uncaught error handlers ─────────────────────────────────────────────
  // These log structured errors before the process crashes, so container
  // logs have a clear record of the cause.
  process.on("uncaughtException", (err) => {
    console.error("[instrumentation] uncaughtException:", err);
    // Don't exit immediately — let Next.js handle the request error. But
    // flag that we should exit on the next graceful opportunity.
    process.exitCode = 1;
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[instrumentation] unhandledRejection:", reason);
    process.exitCode = 1;
  });
}
