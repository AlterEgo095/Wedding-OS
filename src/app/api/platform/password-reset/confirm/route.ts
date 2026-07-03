export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { consumeResetToken, hashPassword } from '@/lib/password-reset';
import { isValidPassword, PASSWORD_POLICY_MSG } from '@/lib/constants';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';

/**
 * POST /api/platform/password-reset/confirm
 *
 * Public endpoint (no auth, no CSRF — listed in CSRF_EXEMPT_PATHS). Accepts
 * `{ token, newPassword }` and, if the token is valid + unused + unexpired,
 * updates the AdminUser's password.
 *
 * Validation:
 *   - token must be 64 hex chars (raw token from /request).
 *   - newPassword must pass isValidPassword (≥8 chars, 1 letter, 1 digit).
 *
 * Atomicity: consumeResetToken() marks the token as used BEFORE we hash the
 * new password. If the password update fails for any reason, the token is
 * still consumed (used) — the user must request a new one. This is the
 * safer failure mode: a partially-failed reset that left the token valid
 * would let an attacker retry with a different password.
 *
 * Rate-limited per IP (10 requests / 15 min) — slower than /request because
 * the password hashing (bcrypt, 12 rounds) is expensive.
 *
 * Request body: `{ token: "rawtoken", newPassword: "newpassword" }`
 */
export async function POST(request: NextRequest) {
  try {
    // IP rate-limit: 10 requests per 15 minutes per IP.
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`pwreset-confirm-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Token et nouveau mot de passe requis');
    const { token, newPassword } = body;
    if (!token || typeof token !== 'string') {
      return badRequest('Token requis');
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return badRequest('Nouveau mot de passe requis');
    }

    // Validate password strength BEFORE consuming the token (cheaper, and
    // avoids burning a valid token on a weak password).
    if (!isValidPassword(newPassword)) {
      return badRequest(PASSWORD_POLICY_MSG);
    }

    // Consume the token (atomic, one-time use).
    const email = await consumeResetToken(token);
    if (!email) {
      return badRequest('Token invalide, expiré ou déjà utilisé');
    }

    // Find the user. If they don't exist (someone requested a reset for a
    // bogus email), return the same error as an invalid token — preserves
    // the user-enumeration protection from /request.
    const user = await db.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      return badRequest('Token invalide, expiré ou déjà utilisé');
    }

    // Hash the new password (bcrypt, 12 rounds).
    const hashedPassword = await hashPassword(newPassword);

    await db.adminUser.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await writeAuditLog({
      weddingId: null,
      userId: user.id,
      action: 'PASSWORD_RESET_CONFIRMED',
      details: `Password reset confirmed for ${user.email}`,
      request,
    });

    logger.info('Password reset confirmed', { email: user.email });

    return withSecurityHeaders(
      NextResponse.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
      })
    );
  } catch (error) {
    logger.error('Password reset confirm error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
