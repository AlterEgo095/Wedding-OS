export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger"; // P2-SEC-8
import { getRedis } from "@/lib/redis"; // P1-2 (sprint P1)

/**
 * Health check endpoint (P1-PROD-1).
 *
 * Used by:
 *   - Docker HEALTHCHECK directive
 *   - Reverse proxy / load balancer health probes
 *   - Uptime monitoring (external service)
 *
 * Returns 200 OK with component status, or 503 with the failing component.
 * The check is intentionally cheap (SELECT 1 + env sanity) so it can be
 * polled frequently without putting load on the DB.
 *
 * Auth: NONE — this route must be reachable without credentials. It does not
 * leak any business data (only component statuses + version).
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { status: "ok" | "fail"; latencyMs?: number; error?: string }> = {};

  // ─── Database connectivity ────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    // P2-SEC-8: in production, never expose the raw DB error message — it
    // can leak connection-string fragments, hostnames, or Prisma internals
    // to unauthenticated callers (this endpoint has no auth). In dev we
    // keep err.message for faster local debugging.
    const isProd = process.env.NODE_ENV === "production";
    checks.database = {
      status: "fail",
      error: isProd
        ? "database unreachable"
        : err instanceof Error ? err.message : "Unknown DB error",
    };
    // P2-SEC-1: structured logger, no stack leak.
    logger.error("Health check DB failure", {
      errMessage: err instanceof Error ? err.message : String(err),
      errName: err instanceof Error ? err.name : "Unknown",
    });
  }

  // ─── Redis connectivity (P1-2, sprint P1) ──────────────────────────────
  // Non-fatal: si Redis est down, le rate-limiting retombe en mémoire et la
  // santé globale reste 200. La sonde rend l'état observable par les ops.
  try {
    const redis = await getRedis();
    if (redis) {
      const t0 = Date.now();
      await redis.ping();
      checks.redis = { status: "ok", latencyMs: Date.now() - t0 };
    }
    // Redis non configuré -> clé absente (comportement historique préservé)
  } catch {
    checks.redis = { status: "fail", error: "redis unreachable" };
  }

  // ─── Required env vars ────────────────────────────────────────────────────
  // Note: in production, lib/auth.ts and lib/guest-auth.ts already fail-fast
  // on missing JWT_SECRET / ENCRYPTION_KEY. This check surfaces the same
  // info to ops without triggering a 500 on every auth request.
  const isProd = process.env.NODE_ENV === "production";
  const requiredEnvVars = isProd
    ? ["JWT_SECRET", "ENCRYPTION_KEY", "DATABASE_URL"]
    : ["DATABASE_URL"];
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  checks.env = missing.length === 0
    ? { status: "ok" }
    : { status: "fail", error: `Missing: ${missing.join(", ")}` };

  // ─── Aggregate ────────────────────────────────────────────────────────────
  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      // Mission 4.0 Phase 1 — Runtime provenance.
      // DEPLOY_SHA + BUILD_TIME are injected at Docker build time (see
      // Dockerfile ARG + ENV). This lets /api/health prove which git commit
      // the running container was built from, enabling:
      //   GitHub main SHA == VPS HEAD == container deploySha
      // When DEPLOY_SHA is absent (local dev), we fall back to "dev-local"
      // so the field is always present + meaningful.
      version: process.env.npm_package_version || "unknown",
      deploySha: process.env.DEPLOY_SHA || "dev-local",
      buildTime: process.env.BUILD_TIME || null,
      environment: process.env.NODE_ENV || "development",
      env: process.env.NODE_ENV || "development",
      checks,
      totalLatencyMs: Date.now() - startedAt,
    },
    { status }
  );
}
