// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/impersonate/route.ts — Phase 4C View-as / Impersonate (START)
// ══════════════════════════════════════════════════════════════════════════════
//
// POST /api/platform/impersonate
//
// Body: `{ targetUserId: string }`
//
// Auth: PLATFORM_ADMIN / SUPER_ADMIN only.
//
// Validates: target user exists, target is a wedding admin (ORGANIZER /
// RECEPTION / CONTROLLER — these are the per-wedding roles that own a
// `weddingId` and can log into `/w/[slug]/admin`). Org-scoped roles
// (ORG_ADMIN/ORG_MEMBER/ORG_VIEWER) are intentionally NOT impersonatable
// (they don't own a single wedding — the audit §20.6 spec scopes Phase 4C
// to wedding admins only).
//
// Flow:
//   1. Resolve the admin from the auth_token cookie.
//   2. Fail-closed if the admin is not a PLATFORM_ADMIN / SUPER_ADMIN.
//   3. Fetch the target AdminUser. Fail if missing / suspended / wrong role.
//   4. Resolve the target's wedding (via target.weddingId) to fetch its slug.
//   5. Capture the admin's current `auth_token` cookie value (the JWT we'll
//      restore on stop / auto-expiry).
//   6. Sign an impersonation_session JWT (adminUserId, targetUserId,
//      originalToken, expiresAt = NOW + 30min).
//   7. Generate a NEW auth_token JWT for the target user (via generateToken).
//   8. Set BOTH cookies on the response:
//        - `auth_token` = target's new JWT (the admin "becomes" the target)
//        - `impersonation_session` = the impersonation JWT (httpOnly, 35min)
//   9. Write an audit-log entry: action='impersonate.start', actorId=adminId,
//      targetUserId, details with expiry ISO + admin email.
//  10. Return `{ success: true, redirectUrl: '/w/[slug]/admin' }`.
//
// Audit: every start MUST be logged in AuditLog. The write is best-effort
// (writeAuditLog never throws) — but if the write fails, we still proceed
// because the impersonation has already happened (the cookies are set). The
// failure is logged via the logger.
//
// No Prisma changes: the impersonation session is stored entirely in the
// JWT/cookie — no new table. The AuditLog model is reused (no schema change).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getAuthUser,
  requirePlatformAdmin,
  generateToken,
  setAuthCookie,
  setImpersonationCookie,
  signImpersonationToken,
  IMPERSONATION_MAX_AGE_MS,
  type ImpersonationPayload,
} from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/types';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound, forbidden } from '@/lib/api-errors';

/** Per-wedding roles that own a `weddingId` and can be impersonated. */
const IMPERSONATABLE_ROLES = new Set(['ORGANIZER', 'RECEPTION', 'CONTROLLER']);

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth: PLATFORM_ADMIN / SUPER_ADMIN only ──────────────────────
    // The `auth_token` cookie at this point contains the PLATFORM_ADMIN's
    // JWT. getAuthUser refreshes role/weddingId from DB (defense-in-depth
    // against stale-claim attacks).
    const adminUser = await getAuthUser(request);
    const denied = requirePlatformAdmin(adminUser);
    if (denied) return denied;
    if (!adminUser) {
      // Should be unreachable (requirePlatformAdmin handles null), but TS
      // narrowing can't see through the helper. Belt + suspenders.
      return forbidden('Accès refusé');
    }

    // ── 2. Parse + validate body ────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequest('Corps de requête invalide');
    }
    const { targetUserId } = body as { targetUserId?: unknown };
    if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return badRequest('targetUserId est requis');
    }

    // ── 3. Resolve target user from DB ──────────────────────────────────
    const targetUser = await db.adminUser.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        weddingId: true,
        suspended: true,
      },
    });
    if (!targetUser) {
      return notFound('Utilisateur cible introuvable');
    }

    // ── 4. Validate target role + suspension state ──────────────────────
    // CRITICAL CONSTRAINT: no privilege escalation. The admin gets EXACTLY
    // the target's permissions. So we must reject suspended targets (they
    // have NO permissions) and non-wedding-admin roles (not in spec scope).
    if (targetUser.suspended) {
      return forbidden('Utilisateur cible suspendu — impersonation refusée');
    }
    if (!IMPERSONATABLE_ROLES.has(targetUser.role)) {
      return forbidden(
        `Seuls les rôles ORGANIZER, RECEPTION et CONTROLLER sont impersonnables (reçu: ${targetUser.role})`,
      );
    }
    // Target must own a wedding — otherwise we can't redirect to a wedding admin URL.
    if (!targetUser.weddingId) {
      return forbidden(
        "L'utilisateur cible n'est rattaché à aucun mariage",
      );
    }
    // Belt + suspenders: PLATFORM_ADMIN can't be impersonated (would be
    // privilege escalation in the other direction — not in spec scope).
    if (isPlatformAdmin(targetUser.role)) {
      return forbidden('Impossible d\'impersonner un administrateur plateforme');
    }

    // ── 5. Resolve the target's wedding slug (for the redirect URL) ─────
    const targetWedding = await db.wedding.findUnique({
      where: { id: targetUser.weddingId },
      select: { id: true, slug: true },
    });
    if (!targetWedding) {
      // The target user's weddingId points to a non-existent wedding —
      // data integrity issue. Fail closed.
      return notFound("Le mariage de l'utilisateur cible est introuvable");
    }

    // ── 6. Capture the admin's original auth_token (for restoration) ────
    // This is the cookie value at the time of the impersonation start. It
    // is a JWT with its own 8h expiry — embedded inside the
    // impersonation_session JWT (signed) so it survives the 30-min window
    // and can be restored on stop / auto-expiry.
    const originalToken = request.cookies.get('auth_token')?.value;
    if (!originalToken) {
      // Should be unreachable (getAuthUser succeeded above), but fail safe.
      return forbidden('Jeton d\'authentification manquant');
    }

    // ── 7. Sign the impersonation_session JWT (35min TTL, 30min window) ─
    const now = Date.now();
    const expiresAt = now + IMPERSONATION_MAX_AGE_MS;
    const impersonationPayload: ImpersonationPayload = {
      adminUserId: adminUser.id,
      adminEmail: adminUser.email,
      targetUserId: targetUser.id,
      targetName: targetUser.name,
      targetRole: targetUser.role,
      targetEmail: targetUser.email,
      originalToken,
      expiresAt,
    };
    const impersonationToken = signImpersonationToken(impersonationPayload);

    // ── 8. Generate the target's auth_token JWT ─────────────────────────
    // The admin "becomes" the target — exactly the target's permissions,
    // no more, no less. generateToken embeds role + weddingId from the
    // target user, NOT from the admin.
    const targetToken = generateToken({
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      weddingId: targetUser.weddingId,
    });

    // ── 9. Write audit log BEFORE setting cookies ───────────────────────
    // Order matters: if the cookie write fails for some reason, we still
    // have the audit trail showing the admin INTENDED to impersonate (and
    // the actor / target / expiry are all recorded). Non-fatal — never
    // throws (writeAuditLog swallows errors and logs them).
    const expiresAtIso = new Date(expiresAt).toISOString();
    await writeAuditLog({
      weddingId: targetWedding.id, // tenant-scoped audit (the wedding being impersonated)
      userId: adminUser.id, // the actor (PLATFORM_ADMIN)
      action: 'impersonate.start',
      details: `Admin plateforme ${adminUser.email} a démarré une session d'impersonation sur ${targetUser.email} (${targetUser.role}). Expiration: ${expiresAtIso}.`,
      request,
      result: 'SUCCESS',
      targetUserId: targetUser.id,
      targetType: 'USER',
      targetResourceId: targetWedding.id,
    });

    // ── 10. Set both cookies + return success ───────────────────────────
    const response = NextResponse.json({
      success: true,
      redirectUrl: `/w/${targetWedding.slug}/admin`,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
      expiresAt,
    });
    setAuthCookie(response, targetToken); // overwrite auth_token with target's
    setImpersonationCookie(response, impersonationToken); // set the new cookie
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('impersonate.start API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
