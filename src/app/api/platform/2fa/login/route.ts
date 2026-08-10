export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  generateToken,
  setAuthCookie,
  checkLoginRateLimitAsync,
  resetLoginRateLimitAsync,
} from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import { isPlatformAdmin } from '@/lib/types';
import {
  verifyChallengeToken,
  verifyToken,
  decryptSecret,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * POST /api/platform/2fa/login
 *
 * Second step of the 2FA login flow. Receives the challenge token (issued by
 * /api/platform/login when the user has 2FA enabled) plus a 6-digit TOTP
 * code from the user's authenticator. Verifies both, then issues the real
 * auth_token cookie (same as a regular successful login).
 *
 * This endpoint is in CSRF_EXEMPT_PATHS because the user has no auth cookie
 * yet at this point (only the challenge token, which is in the body).
 *
 * Request body: `{ challengeToken: "...", token: "123456" }`
 * Response: `{ user, csrfToken }` + Set-Cookie: auth_token=...; csrf_token=...
 */
export async function POST(request: NextRequest) {
  try {
    // IP rate-limit (same 10/15min envelope as the regular login).
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`platform-2fa-login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('challengeToken + code TOTP requis');
    const { challengeToken, token: totpToken } = body;
    if (!challengeToken || typeof challengeToken !== 'string') {
      return badRequest('challengeToken requis');
    }
    if (!totpToken || typeof totpToken !== 'string') {
      return badRequest('Code TOTP requis');
    }

    // 1. Verify challenge token (5-min JWT, purpose=2fa-challenge, user still
    //    exists + still has 2FA enabled).
    const challenge = await verifyChallengeToken(challengeToken);
    if (!challenge) {
      return badRequest('Jeton de défi 2FA invalide ou expiré');
    }

    // 2. Per-user rate limit (5 attempts / 15 min) — defends against brute
    //    force on the 6-digit TOTP code (only 10^6 possibilities, but
    //    otplib's window of ±1 step × 5 attempts = effectively 15 code
    //    candidates per attempt, so 5 attempts = 75 candidates — far below
    //    the 10^6 space, very unlikely to guess).
    // P5.3-6 (audit-F H-3): Redis-backed login rate limit (with in-memory fallback).
    const { allowed: loginAllowed, retryAfterSeconds } = await checkLoginRateLimitAsync(`2fa-${challenge.email.toLowerCase()}`);
    if (!loginAllowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives 2FA. Veuillez réessayer plus tard.' },
        { status: 429, headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined }
      );
    }

    // 3. Re-fetch user + decrypt secret.
    const user = await db.adminUser.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        weddingId: true,
        twoFactorSecret: true,
        twoFactorEnabled: true,
      },
    });
    if (!user) return badRequest('Utilisateur introuvable');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return badRequest('2FA n\'est pas activée pour cet utilisateur');
    }
    if (!isPlatformAdmin(user.role)) {
      return badRequest('Réservé aux administrateurs plateforme');
    }

    const secret = decryptSecret(user.twoFactorSecret);
    if (!secret) {
      return badRequest('Secret 2FA illisible. Contactez un administrateur.');
    }

    // 4. Verify TOTP code.
    if (!verifyToken(totpToken, secret)) {
      return badRequest('Code TOTP invalide');
    }

    // 5. Success — reset per-user rate limit, issue real auth cookie.
    await resetLoginRateLimitAsync(`2fa-${challenge.email.toLowerCase()}`);

    const authToken = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    });

    await Promise.all([
      db.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      writeAuditLog({
        weddingId: null,
        userId: user.id,
        action: 'PLATFORM_LOGIN_2FA_SUCCESS',
        details: `Platform admin ${user.email} logged in via 2FA`,
        request,
      }),
    ]);

    const csrfToken = generateCsrfToken();
    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    };

    const response = NextResponse.json({ user: publicUser, csrfToken });
    setAuthCookie(response, authToken);
    setCsrfCookie(response, csrfToken);
    logTwoFactorEvent('login_success', { userId: user.id, email: user.email });
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('2FA login error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
