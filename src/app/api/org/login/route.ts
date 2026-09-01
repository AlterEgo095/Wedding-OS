export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyPassword,
  generateToken,
  checkLoginRateLimitAsync,
  resetLoginRateLimitAsync,
  setAuthCookie,
} from '@/lib/auth';
import { getRateLimitKey, checkRateLimitAsync, withSecurityHeaders } from '@/lib/rate-limit';
import { isPlatformAdmin, isOrgRole } from '@/lib/types';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
// P4.7: 2FA challenge — if the user has 2FA enabled, return a short-lived
// challenge token instead of setting the auth cookie. The client then POSTs
// { challengeToken, token } to /api/auth/2fa/login (generic 2FA endpoint
// that works for ALL admin/staff roles, not just ORG_*).
import { generateChallengeToken } from '@/lib/two-factor';

/**
 * Mission 6.0 P1.8 — Organization login endpoint.
 *
 * POST /api/org/login
 *   body: { email, password }
 *   → 200 { user, csrfToken, redirectTo }
 *
 * Accepts ALL roles (platform admin, org roles, per-wedding roles). The
 * response includes a `redirectTo` hint so the client can dispatch the user
 * to the right admin shell based on their role:
 *
 *   - PLATFORM_ADMIN / SUPER_ADMIN → /platform/admin
 *   - ORG_ADMIN / ORG_MEMBER / ORG_VIEWER → /org/[orgSlug]/admin
 *       (orgSlug resolved from user.organizationId)
 *   - ORGANIZER / RECEPTION / CONTROLLER → /w/[weddingSlug]/admin
 *       (weddingSlug resolved from user.weddingId)
 *
 * If the user has 2FA enabled, the flow returns a challenge token instead
 * (mirrors /api/platform/login's 2FA path). The client posts the TOTP code
 * to /api/platform/2fa/login, which verifies + sets the auth cookie, then
 * the client must re-fetch /api/me to determine the redirect.
 *
 * Auth model mirrors /api/platform/login: httpOnly auth_token cookie +
 * csrf_token cookie + csrfToken echoed in the body (P1-SEC-3 + P1-SEC-7).
 */
export async function POST(request: NextRequest) {
  try {
    // ─── IP-based rate limit (10 attempts / 15 min) ────────────────────────
    const rateLimitKey = getRateLimitKey(request);
    if (!(await checkRateLimitAsync(`org-login-${rateLimitKey}`, 10, 15 * 60 * 1000)).allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ─── Per-email rate limit (5 attempts / 15 min) ────────────────────────
    // P5.3-6 (audit-F H-3): Redis-backed login rate limit (with in-memory fallback).
    const { allowed: loginAllowed, retryAfterSeconds } = await checkLoginRateLimitAsync(normalizedEmail);
    if (!loginAllowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
        { status: 429, headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    await resetLoginRateLimitAsync(normalizedEmail);

    // ─── P4.7: 2FA check (any admin/staff role) ───────────────────────────
    // If the user has 2FA enabled, do NOT issue the auth cookie yet. Return
    // a short-lived challenge token that allows ONLY /api/auth/2fa/login.
    // The client UI prompts for a 6-digit TOTP code (or backup code) and
    // POSTs it with the challenge token to /api/auth/2fa/login, which
    // verifies the code and only then sets the auth cookie.
    if (user.twoFactorEnabled) {
      await writeAuditLog({
        weddingId: user.weddingId,
        userId: user.id,
        action: 'TWO_FACTOR_LOGIN_CHALLENGE',
        details: `2FA challenge issued for ${user.email} (role=${user.role}) via org login`,
        request,
      });

      const challengeToken = generateChallengeToken(user.id, user.email);
      const twoFactorResponse = NextResponse.json({
        requiresTwoFactor: true,
        challengeToken,
        // Echo the user's email + name + role so the UI can personalize
        // the 2FA prompt ("Entrez le code pour {email}"). Never echo the
        // secret.
        email: user.email,
        name: user.name,
        role: user.role,
      });
      // P1-SEC-7: set a fresh CSRF cookie so the subsequent
      // /api/auth/2fa/login POST has a valid double-submit pair.
      const csrfToken = generateCsrfToken();
      setCsrfCookie(twoFactorResponse, csrfToken);
      return withSecurityHeaders(twoFactorResponse);
    }

    // ─── Issue JWT + cookie ────────────────────────────────────────────────
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
      organizationId: user.organizationId,
    });

    await Promise.all([
      db.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      writeAuditLog({
        weddingId: user.weddingId,
        userId: user.id,
        action: 'ORG_LOGIN',
        details: `User ${user.email} logged in via org portal (role: ${user.role})`,
        request,
      }),
    ]);

    // ─── Resolve redirect target ───────────────────────────────────────────
    const redirectTo = await resolveRedirectTo(user);

    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
      organizationId: user.organizationId,
    };

    const csrfToken = generateCsrfToken();

    const response = NextResponse.json({ user: publicUser, csrfToken, redirectTo });
    setAuthCookie(response, token);
    setCsrfCookie(response, csrfToken);
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('Org login error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

/**
 * Determine where the client should land after a successful org login.
 *
 *  - PLATFORM_ADMIN / SUPER_ADMIN → /platform/admin
 *  - ORG_*                          → /org/[orgSlug]/admin
 *                                      (resolves slug from user.organizationId)
 *  - ORGANIZER / RECEPTION /
 *    CONTROLLER                     → /w/[weddingSlug]/admin
 *                                      (resolves slug from user.weddingId)
 *
 * Returns "/" as a safe fallback if neither lookup succeeds (orphaned user).
 */
async function resolveRedirectTo(user: {
  role: string;
  weddingId?: string | null;
  organizationId?: string | null;
}): Promise<string> {
  if (isPlatformAdmin(user.role)) {
    return '/platform/admin';
  }

  if (isOrgRole(user.role)) {
    if (!user.organizationId) return '/';
    const org = await db.organization.findUnique({
      where: { id: user.organizationId },
      select: { slug: true },
    });
    if (!org) return '/';
    return `/org/${org.slug}/admin`;
  }

  // Per-wedding roles (ORGANIZER / RECEPTION / CONTROLLER).
  if (user.weddingId) {
    const wedding = await db.wedding.findUnique({
      where: { id: user.weddingId },
      select: { slug: true },
    });
    if (wedding) return `/w/${wedding.slug}/admin`;
  }

  return '/';
}
