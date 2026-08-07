export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  generateToken,
  setAuthCookie,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import {
  verifyChallengeToken,
  verifyToken,
  verifyBackupCode,
  decryptSecret,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
import { writeAuditLog } from '@/lib/audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/2fa/login — P4.7 Generic 2FA login (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// Second step of the 2FA login flow for ALL admin/staff roles. Receives the
// challenge token (issued by /api/admin/login OR /api/platform/login when
// the user has 2FA enabled) plus either:
//   - `token`: a 6-digit TOTP code from the user's authenticator, OR
//   - `backupCode`: an 8-char one-time backup code (xxxx-xxxx format).
//
// Verifies the challenge token + the second factor, then issues the real
// `auth_token` cookie (same as a regular successful login).
//
// This endpoint is in CSRF_EXEMPT_PATHS (see src/lib/csrf.ts) because the
// user has no auth cookie yet at this point — only the challenge token in
// the body. The /api/admin/login and /api/platform/login endpoints issue a
// fresh CSRF cookie alongside the challenge response so the client CAN send
// a matching X-CSRF-Token header, but we exempt this path defensively in
// case the client lost the cookie (mobile browsers, Safari ITP, etc.).
//
// Contract:
//   - POST, NO auth cookie required (challenge token in body).
//   - 10 attempts / minute per IP (withRateLimit) + per-user rate limit
//     (5 attempts / 15 min via checkLoginRateLimit).
//   - Body: `{ challengeToken: string, token?: string, backupCode?: string }`
//     (Zod-validated — exactly one of `token` or `backupCode` required).
//   - Returns `{ user, csrfToken }` + Set-Cookie: auth_token + csrf_token.

const LoginBodySchema = z
  .object({
    challengeToken: z.string().min(1, 'challengeToken requis'),
    token: z.string().regex(/^\d{6}$/, 'Code TOTP invalide').optional(),
    backupCode: z
      .string()
      .regex(/^[a-f0-9]{4}-[a-f0-9]{4}$/i, 'Code de secours invalide')
      .optional(),
  })
  .refine((data) => Boolean(data.token) !== Boolean(data.backupCode), {
    message: 'Fournissez soit `token` (TOTP) soit `backupCode`, pas les deux',
  });

export const POST = withRateLimit(10, 60_000)(
  async (request: NextRequest) => {
    try {
      // ─── IP rate-limit (10/min, defense-in-depth on top of withRateLimit) ──
      const rateLimitKey = getRateLimitKey(request);
      if (!checkRateLimit(`auth-2fa-login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
        return apiError('Trop de tentatives. Veuillez réessayer plus tard.', 429);
      }

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('challengeToken + code TOTP requis');
      const parsed = LoginBodySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide');
      }
      const { challengeToken, token: totpToken, backupCode } = parsed.data;

      // 1. Verify challenge token (5-min JWT, purpose=2fa-challenge, user
      //    still exists + still has 2FA enabled). This also re-fetches the
      //    user from DB to defend against deleted/disabled accounts.
      const challenge = await verifyChallengeToken(challengeToken);
      if (!challenge) {
        return badRequest('Jeton de défi 2FA invalide ou expiré');
      }

      // 2. Per-user rate limit (5 attempts / 15 min) — defends against brute
      //    force on the 6-digit TOTP code or the 8 backup codes.
      if (!checkLoginRateLimit(`2fa-${challenge.email.toLowerCase()}`)) {
        return apiError('Trop de tentatives 2FA. Veuillez réessayer plus tard.', 429);
      }

      // 3. Re-fetch user + decrypt secret + load backup codes.
      const user = await db.adminUser.findUnique({
        where: { id: challenge.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          weddingId: true,
          organizationId: true,
          twoFactorSecret: true,
          twoFactorEnabled: true,
          twoFactorBackupCodes: true,
        },
      });
      if (!user) return badRequest('Utilisateur introuvable');
      if (!user.twoFactorEnabled) {
        return badRequest('2FA n\'est pas activée pour cet utilisateur');
      }

      let secondFactorOk = false;
      let usedBackupCodeIndex = -1;

      if (totpToken) {
        // ─── TOTP path ──────────────────────────────────────────────────────
        if (!user.twoFactorSecret) {
          return badRequest('Secret 2FA illisible. Contactez un administrateur.');
        }
        const secret = decryptSecret(user.twoFactorSecret);
        if (!secret) {
          return badRequest('Secret 2FA illisible. Contactez un administrateur.');
        }
        secondFactorOk = verifyToken(totpToken, secret);
      } else if (backupCode) {
        // ─── Backup-code path ───────────────────────────────────────────────
        // Parse the stored JSON array of SHA-256 hashes. Defensive: if the
        // column is null or malformed, treat as "no backup codes available".
        if (!user.twoFactorBackupCodes) {
          return badRequest('Aucun code de secours enregistré');
        }
        let hashedCodes: string[] = [];
        try {
          const parsedCodes = JSON.parse(user.twoFactorBackupCodes);
          if (Array.isArray(parsedCodes)) {
            hashedCodes = parsedCodes.filter((c): c is string => typeof c === 'string');
          }
        } catch {
          hashedCodes = [];
        }
        if (hashedCodes.length === 0) {
          return badRequest('Aucun code de secours enregistré');
        }
        usedBackupCodeIndex = verifyBackupCode(backupCode, hashedCodes);
        secondFactorOk = usedBackupCodeIndex >= 0;
      }

      if (!secondFactorOk) {
        return badRequest(
          totpToken ? 'Code TOTP invalide' : 'Code de secours invalide ou déjà utilisé'
        );
      }

      // 4. If a backup code was used, remove it from the stored array
      //    (one-time use). Atomic-ish: re-read → splice → write. Race
      //    conditions are bounded by the per-user rate limit + the fact that
      //    the user must pass the challenge token first.
      if (usedBackupCodeIndex >= 0 && user.twoFactorBackupCodes) {
        try {
          const hashedCodes: string[] = JSON.parse(user.twoFactorBackupCodes);
          hashedCodes.splice(usedBackupCodeIndex, 1);
          await db.adminUser.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: JSON.stringify(hashedCodes) },
          });
        } catch {
          // Non-fatal: the backup code was valid, login proceeds. The
          // stale hash will eventually be rejected on next use because it
          // has already been consumed (the splice just didn't persist).
          logger.warn('2fa.login: failed to splice used backup code', { userId: user.id });
        }
      }

      // 5. Success — reset per-user rate limit, issue real auth cookie.
      resetLoginRateLimit(`2fa-${challenge.email.toLowerCase()}`);

      const authToken = generateToken({
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
          weddingId: user.weddingId ?? null,
          userId: user.id,
          action: 'TWO_FACTOR_LOGIN_SUCCESS',
          details: `User ${user.email} (role=${user.role}) logged in via 2FA${
            usedBackupCodeIndex >= 0 ? ' (backup code)' : ''
          }`,
          request,
        }).catch(() => { /* audit failure is non-fatal */ }),
      ]);

      const csrfToken = generateCsrfToken();
      const publicUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        weddingId: user.weddingId,
        organizationId: user.organizationId,
      };

      const response = apiSuccess({ user: publicUser, csrfToken });
      setAuthCookie(response, authToken);
      setCsrfCookie(response, csrfToken);
      logTwoFactorEvent('login_success', {
        userId: user.id,
        email: user.email,
        role: user.role,
        viaBackupCode: usedBackupCodeIndex >= 0,
      });
      return withSecurityHeaders(response);
    } catch (error) {
      logger.error('2FA login (generic) error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return apiError('Erreur interne du serveur', 500);
    }
  }
);
