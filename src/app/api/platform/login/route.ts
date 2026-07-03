export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyPassword,
  generateToken,
  checkLoginRateLimit,
  resetLoginRateLimit,
  setAuthCookie,
} from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import { isPlatformAdmin } from '@/lib/types';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P1-SEC-7: CSRF double-submit token — issued alongside the auth cookie so the
// client has it immediately after login (no extra round-trip to /api/csrf-token).
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
// P1-SEC-8: TOTP 2FA challenge — if the user has 2FA enabled, return a
// short-lived challenge token instead of setting the auth cookie.
import { generateChallengeToken } from '@/lib/two-factor';

/**
 * Platform admin login endpoint.
 *
 * Same flow as /api/admin/login but gated to PLATFORM_ADMIN / SUPER_ADMIN
 * users only. The issued JWT carries `isPlatformAdmin: true` and
 * `weddingId: null`, which the platform middleware uses to grant
 * cross-tenant access on /api/platform/* routes.
 *
 * AuditLog action `PLATFORM_LOGIN` is recorded with `weddingId: null` so
 * platform-level events are easy to filter in the dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── IP-based rate limit (10 attempts / 15 min) ────────────────────────
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`platform-login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // ─── Per-email rate limit (5 attempts / 15 min) ────────────────────────
    const normalizedEmail = email.toLowerCase();
    if (!checkLoginRateLimit(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ─── Platform-admin gate ───────────────────────────────────────────────
    // Only PLATFORM_ADMIN / SUPER_ADMIN may use this endpoint. Regular
    // wedding organizers must log in via /api/admin/login instead.
    if (!isPlatformAdmin(user.role)) {
      return NextResponse.json(
        { error: 'Platform admin access required' },
        { status: 403 }
      );
    }

    resetLoginRateLimit(normalizedEmail);

    // ─── P1-SEC-8: 2FA check ───────────────────────────────────────────────
    // If the user has 2FA enabled, do NOT issue the auth cookie yet. Return a
    // short-lived challenge token that allows ONLY /api/platform/2fa/login.
    // The client UI must prompt for a 6-digit TOTP code and POST it with the
    // challenge token to /api/platform/2fa/login, which verifies the code and
    // only then sets the auth cookie.
    if (user.twoFactorEnabled) {
      // Best-effort audit: record the 2FA challenge issuance.
      await writeAuditLog({
        weddingId: null,
        userId: user.id,
        action: 'PLATFORM_LOGIN_2FA_CHALLENGE',
        details: `2FA challenge issued for ${user.email}`,
        request,
      });

      const challengeToken = generateChallengeToken(user.id, user.email);
      const twoFactorResponse = NextResponse.json({
        requiresTwoFactor: true,
        challengeToken,
        // Echo the user's email + name so the UI can personalize the 2FA
        // prompt ("Enter the code from your authenticator for
        // admin@heureux-mariage.com"). Never echo the secret.
        email: user.email,
        name: user.name,
      });
      // P1-SEC-7: even though we don't set the auth cookie here, we DO set a
      // fresh CSRF cookie so the subsequent /api/platform/2fa/login POST has
      // a valid double-submit pair. (2fa/login is in CSRF_EXEMPT_PATHS, so
      // technically not required — but defense-in-depth.)
      const csrfToken = generateCsrfToken();
      setCsrfCookie(twoFactorResponse, csrfToken);
      return withSecurityHeaders(twoFactorResponse);
    }

    // ─── Issue JWT + cookie ────────────────────────────────────────────────
    // generateToken() embeds weddingId (null here) + isPlatformAdmin flag.
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId, // null for platform admins
    });

    // ─── Update lastLoginAt + audit log (P2-SEC-14) ───────────────────
    // (Skipped wrapping POST with withRateLimit — this route already uses
    // checkRateLimit on IP + checkLoginRateLimit on email.)
    await Promise.all([
      db.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      writeAuditLog({
        weddingId: null, // platform-level event
        userId: user.id,
        action: 'PLATFORM_LOGIN',
        details: `Platform admin ${user.email} logged in`,
        request,
      }),
    ]);

    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    };

    // P1-SEC-7: issue CSRF token here so the client can make authenticated
    // POSTs immediately after login (no extra /api/csrf-token round-trip).
    const csrfToken = generateCsrfToken();

    // P1-SEC-3: token is no longer returned in the body — the httpOnly
    // `auth_token` cookie set below is the secure path. The `user` object
    // is kept so the client can render the admin shell without an extra
    // /api/me round-trip. `csrfToken` is echoed so the client can prime its
    // in-memory cache without reading document.cookie.
    const response = NextResponse.json({ user: publicUser, csrfToken });
    setAuthCookie(response, token);
    // P1-SEC-7: set the CSRF double-submit cookie (httpOnly=false).
    setCsrfCookie(response, csrfToken);
    return withSecurityHeaders(response);
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Platform login error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
