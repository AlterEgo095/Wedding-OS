export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, generateToken, checkLoginRateLimit, resetLoginRateLimit, setAuthCookie } from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P1-SEC-7: CSRF double-submit token — issued alongside the auth cookie so the
// client has it immediately after login (no extra round-trip to /api/csrf-token).
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
// P4.7: 2FA challenge — if the user has 2FA enabled, return a short-lived
// challenge token instead of setting the auth cookie. The client then POSTs
// { challengeToken, token } to /api/auth/2fa/login (generic 2FA endpoint
// that works for ALL admin/staff roles, not just PLATFORM_ADMIN).
import { generateChallengeToken } from '@/lib/two-factor';

export async function POST(request: NextRequest) {
  try {
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
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

    if (!checkLoginRateLimit(email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    resetLoginRateLimit(email.toLowerCase());

    // ─── P4.7: 2FA check (any admin/staff role) ───────────────────────────
    // If the user has 2FA enabled, do NOT issue the auth cookie yet. Return a
    // short-lived challenge token that allows ONLY /api/auth/2fa/login.
    // The client UI must prompt for a 6-digit TOTP code (or backup code) and
    // POST it with the challenge token to /api/auth/2fa/login, which verifies
    // the code and only then sets the auth cookie.
    //
    // This check is role-agnostic — works for ORGANIZER, RECEPTION,
    // CONTROLLER, ORG_ADMIN, ORG_MEMBER, ORG_VIEWER, DESIGNER, ART_DIRECTOR,
    // SUPER_ADMIN and PLATFORM_ADMIN alike. (PLATFORM_ADMIN users typically
    // login via /api/platform/login which has its own 2FA detection; both
    // paths converge on /api/auth/2fa/login for the second factor.)
    if (user.twoFactorEnabled) {
      await writeAuditLog({
        weddingId: user.weddingId,
        userId: user.id,
        action: 'TWO_FACTOR_LOGIN_CHALLENGE',
        details: `2FA challenge issued for ${user.email} (role=${user.role})`,
        request,
      });

      const challengeToken = generateChallengeToken(user.id, user.email);
      const twoFactorResponse = NextResponse.json({
        requiresTwoFactor: true,
        challengeToken,
        // Echo the user's email + name so the UI can personalize the 2FA
        // prompt ("Entrez le code pour {email}"). Never echo the secret.
        email: user.email,
        name: user.name,
        role: user.role,
      });
      // P1-SEC-7: set a fresh CSRF cookie so the subsequent
      // /api/auth/2fa/login POST has a valid double-submit pair (the route
      // is in CSRF_EXEMPT_PATHS as defense-in-depth, but the client should
      // still send the X-CSRF-Token header to benefit from the protection
      // on the rare environments where exemption is disabled).
      const csrfToken = generateCsrfToken();
      setCsrfCookie(twoFactorResponse, csrfToken);
      return withSecurityHeaders(twoFactorResponse);
    }

    // Token now includes weddingId claim (set in auth.ts generateToken)
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    });

    // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
    // (Skipped wrapping POST with withRateLimit — this route already uses
    // two rate-limit checks: checkRateLimit on IP + checkLoginRateLimit on
    // email. Adding a third layer would just consume memory without
    // improving protection.)
    await writeAuditLog({
      weddingId: user.weddingId, // null for SUPER_ADMIN
      userId: user.id,
      action: 'LOGIN',
      details: `User ${user.email} logged in`,
      request,
    });

    // P1-SEC-7: issue CSRF token here so the client can make authenticated
    // POSTs immediately after login (no extra /api/csrf-token round-trip).
    const csrfToken = generateCsrfToken();

    const response = NextResponse.json({
      // P1-SEC-3: token is no longer returned in the body — the httpOnly
      // `auth_token` cookie set below is the secure path. Keeping the
      // `user` object so the client can render the admin shell without
      // an extra /api/me round-trip.
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        weddingId: user.weddingId,
      },
      // P1-SEC-7: CSRF token issued alongside the auth cookie. The cookie
      // (csrf_token, httpOnly=false) is set via setCsrfCookie below; the
      // body echoes the same value so the client can populate its
      // in-memory cache without reading document.cookie.
      csrfToken: csrfToken,
    });

    // SECURITY (P1-SEC-3 + P1-SEC-4): The httpOnly `auth_token` cookie is the
    // ONLY secure authentication path. The browser sends it automatically on
    // every same-origin request; client JS cannot read it (XSS-resistant).
    setAuthCookie(response, token);
    // P1-SEC-7: set the CSRF double-submit cookie. httpOnly=false so the
    // client can read it for the X-CSRF-Token header on subsequent POSTs.
    setCsrfCookie(response, csrfToken);

    return withSecurityHeaders(response);
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Login error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
