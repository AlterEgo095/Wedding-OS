// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/preview-token/[slug]/route.ts
// Phase 5.9.0 POST-PHASE-3 — Issue a 24h signed preview token (PLATFORM_ADMIN)
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/platform/preview-token/{slug}
//
//   Auth:          PLATFORM_ADMIN only (httpOnly auth_token cookie, verified
//                  server-side via getAuthUser + requirePlatformAdmin).
//   Rate-limit:    10 requests / minute / admin (in-memory + Redis fallback,
//                  keyed by admin user id via checkRateLimitAsync).
//   Audit-log:     Every successful issuance writes an AuditLog row with
//                  action='preview.token.issue', weddingId, userId, IP, UA,
//                  result='SUCCESS', targetType='WEDDING'. Non-fatal —
//                  writeAuditLog never throws.
//   Cache-Control: no-store (tokens must NEVER be cached by a shared cache —
//                  they're per-admin, per-session, short-lived).
//
//   Response 200:  { token, expiresAt, weddingSlug, ttlSeconds }
//   Response 401:  Unauthorized (no auth_token cookie or invalid JWT).
//   Response 403:  Forbidden (authenticated but not PLATFORM_ADMIN).
//   Response 404:  Wedding slug not found in DB.
//   Response 429:  Rate limit exceeded (with Retry-After header).
//   Response 500:  Internal error (JWT_SECRET missing in prod, DB failure, etc.).
//
// USAGE:
//   The Preview Lab client (src/components/admin/PreviewLab.tsx) calls this
//   endpoint on mount, receives a 24h token, and appends it as `?token=xxx`
//   on the iframe URL: /w/[slug]?preview=true&token=xxx&identity=yyy.
//   The /w/[slug] route verifies the token server-side before granting
//   preview mode (see src/app/w/[slug]/page.tsx).
//
// PATTERN: mirrors /api/platform/quality/[slug]/auto-fix/route.ts (Phase 4B+)
//   — same auth gate (getAuthUser + requirePlatformAdmin), same audit-log
//   pattern (writeAuditLog static import, non-fatal), same Cache-Control
//   header on every response, same withSecurityHeaders wrap on the final
//   NextResponse.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withSecurityHeaders, checkRateLimitAsync } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import {
  issuePreviewToken,
  PREVIEW_TOKEN_TTL_SECONDS,
} from '@/lib/preview-token';

// ─── Rate limit config ───────────────────────────────────────────────────────
//
// checkRateLimitAsync is in src/lib/rate-limit.ts. Returns
// { allowed, retryAfterSeconds? }. We key on the admin's user id (NOT IP)
// because this is a platform-admin-only endpoint — IP-keying would be too
// coarse (multiple admins behind a corporate NAT) and admin-keying is more
// precise (one rogue admin doesn't lock out others).

const RATE_LIMIT_MAX = 10; // 10 requests
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;

    // ─── 1. Auth gate ──────────────────────────────────────────────────────────
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;
    // After this point, user is non-null + PLATFORM_ADMIN (TypeScript doesn't
    // narrow through the helper, so we re-assert).
    if (!user) {
      // Unreachable (requirePlatformAdmin handles null), but TS narrowing.
      return NextResponse.json(
        { error: 'Unauthorized — authentication required' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // ─── 2. Rate limit (per admin user id) ─────────────────────────────────────
    // Fail-open on module error: a broken rate-limit should NOT block token
    // issuance (the token is itself rate-limited by the 24h TTL + admin auth).
    let rateLimitOk = true;
    let retryAfterSeconds: number | undefined;
    try {
      const rl = await checkRateLimitAsync(
        `preview-token:${user.id}`,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS,
      );
      rateLimitOk = rl.allowed;
      retryAfterSeconds = rl.retryAfterSeconds;
    } catch (err) {
      logger.warn('preview-token.rate-limit-module-error', {
        adminId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!rateLimitOk) {
      const response = NextResponse.json(
        {
          error:
            'Trop de demandes de jeton d\'aperçu. Réessayez dans ' +
            `${retryAfterSeconds ?? 60} secondes.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds ?? 60),
            'Cache-Control': 'no-store',
          },
        },
      );
      return withSecurityHeaders(response);
    }

    // ─── 3. Resolve wedding (must exist) ───────────────────────────────────────
    // Minimal projection — we only need id (for audit log + token claim) and
    // slug (for token binding + response echo).
    const wedding = await db.wedding.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!wedding) {
      const response = NextResponse.json(
        { error: `Mariage introuvable pour le slug « ${slug} »` },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
      return withSecurityHeaders(response);
    }

    // ─── 4. Issue token ────────────────────────────────────────────────────────
    let token: string;
    try {
      token = issuePreviewToken(wedding.slug, user.id);
    } catch (err) {
      // Most likely: JWT_SECRET missing in production (preview-token.ts throws
      // in this case). Fail closed — return 500 so the admin sees an error
      // rather than receiving a degraded token.
      logger.error('preview-token.issue-failed', {
        adminId: user.id,
        weddingId: wedding.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return internalError();
    }

    // ─── 5. Audit log (best-effort, never throws) ──────────────────────────────
    //   action:           'preview.token.issue'
    //   weddingId:        wedding.id (tenant-scoped audit row)
    //   userId:           user.id (the platform admin who issued the token)
    //   targetType:       'WEDDING'
    //   targetResourceId: wedding.id
    //   result:           'SUCCESS'
    //   details:          'Issued 24h preview token for /w/{slug}'
    //
    // writeAuditLog is non-fatal: a DB failure is logged via the structured
    // logger but does NOT block the response. The token has already been
    // issued (the admin needs it to use the Preview Lab).
    try {
      await writeAuditLog({
        weddingId: wedding.id,
        userId: user.id,
        action: 'preview.token.issue',
        details: `Issued 24h preview token for /w/${wedding.slug}`,
        targetType: 'WEDDING',
        targetResourceId: wedding.id,
        result: 'SUCCESS',
        request,
      });
    } catch (err) {
      logger.warn('preview-token.audit-log-failed', {
        adminId: user.id,
        weddingId: wedding.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ─── 6. Response ───────────────────────────────────────────────────────────
    const expiresAt = new Date(
      Date.now() + PREVIEW_TOKEN_TTL_SECONDS * 1000,
    ).toISOString();

    logger.info('preview-token.issued', {
      adminId: user.id,
      weddingId: wedding.id,
      weddingSlug: wedding.slug,
      expiresAt,
    });

    const response = NextResponse.json(
      {
        token,
        expiresAt,
        weddingSlug: wedding.slug,
        // Echo the TTL so the client can display "valide 24h" without hardcoding.
        ttlSeconds: PREVIEW_TOKEN_TTL_SECONDS,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, private',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    );
    return withSecurityHeaders(response);
  } catch (error) {
    // Top-level safety net — any uncaught error returns a generic 500
    // (no stack leak). Matches the auto-fix route's catch pattern.
    logger.error('preview-token API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
