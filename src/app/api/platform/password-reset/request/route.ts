export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, buildMailtoResetLink, buildResetUrl, sendResetEmail } from '@/lib/password-reset';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';

/**
 * POST /api/platform/password-reset/request
 *
 * Public endpoint (no auth, no CSRF — listed in CSRF_EXEMPT_PATHS). Accepts
 * `{ email }` and generates a password-reset token. The response is IDENTICAL
 * regardless of whether the email exists in the DB — this prevents
 * user-enumeration attacks.
 *
 * In dev/demo mode (NODE_ENV !== 'production'), the response includes the
 * raw reset URL + mailto: link so the developer can complete the flow
 * manually. In production, the reset URL is delivered via the configured
 * email transport (`sendResetEmail()` in @/lib/password-reset.ts) —
 * currently a structured-logger stub that emits the envelope to stdout so
 * the platform operator can extract + forward the URL. When `SMTP_*` env
 * vars are set + `nodemailer` is installed, the SMTP path is used
 * automatically. The reset URL is NEVER returned in the HTTP body in
 * production (CONS-2-SECURITY Fix 2 / C5).
 *
 * Rate-limited per IP (5 requests / 15 min) to prevent flooding a victim's
 * inbox (when email sending is added) and to slow brute-force token guessing
 * (though token has 256 bits of entropy, brute-force is infeasible).
 *
 * Request body: `{ email: "user@example.com" }`
 */
export async function POST(request: NextRequest) {
  try {
    // IP rate-limit: 5 requests per 15 minutes per IP.
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`pwreset-request-${rateLimitKey}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Email requis');
    const { email } = body;
    if (!email || typeof email !== 'string') {
      return badRequest('Email requis');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always generate a token (even if the user doesn't exist — prevents
    // user-enumeration via response timing or content). The token is stored
    // in the DB; the eventual /confirm endpoint will fail to find the user
    // if the email is bogus, but the request endpoint looks identical.
    const rawToken = await generateResetToken(normalizedEmail);

    // Best-effort audit log. Use a synthetic action so platform admins can
    // filter these in the dashboard. userId is null (user is unauthenticated).
    await writeAuditLog({
      weddingId: null,
      userId: null,
      action: 'PASSWORD_RESET_REQUESTED',
      details: `Password reset requested for ${normalizedEmail}`,
      request,
    });

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // CONS-2-SECURITY (Fix 2 — C5): hand the raw token to the email
      // transport. sendResetEmail() NEVER returns the URL — only a boolean
      // success indicator. The HTTP response body stays enumeration-safe
      // (identical whether the email exists or not, whether the transport
      // succeeded or not).
      //
      // We deliberately do NOT await-and-fail-on-error: even if the transport
      // errors out, the response must remain identical to the success path
      // so an attacker can't distinguish "email exists + transport OK" from
      // "email doesn't exist" / "transport broken". Errors are logged inside
      // sendResetEmail() — the platform operator monitors the logs.
      sendResetEmail(normalizedEmail, rawToken).catch((err) => {
        // Defensive: sendResetEmail already swallows errors internally, but
        // if it ever rethrows we don't want to crash the request.
        logger.error('sendResetEmail threw unexpectedly', {
          email: normalizedEmail,
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : 'Unknown',
        });
      });
      return withSecurityHeaders(
        NextResponse.json({
          message: 'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.',
        })
      );
    }

    // Dev/demo: return the reset URL + mailto link so the developer can
    // complete the flow without an email integration.
    const resetUrl = buildResetUrl(rawToken);
    const mailtoLink = buildMailtoResetLink(normalizedEmail, rawToken);

    return withSecurityHeaders(
      NextResponse.json({
        message: 'Si un compte existe pour cet email, un lien de réinitialisation a été généré.',
        // Dev/demo only — these fields are stripped in production (above).
        resetUrl,
        mailtoLink,
      })
    );
  } catch (error) {
    logger.error('Password reset request error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
