export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import {
  generateSecret,
  buildOtpAuthUrl,
  generateQrCodeDataUrl,
  encryptSecret,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { logger } from '@/lib/logger';
import { internalError, unauthorized, badRequest } from '@/lib/api-errors';

/**
 * POST /api/platform/2fa/setup
 *
 * Initiates 2FA setup for the authenticated platform admin. Generates a
 * fresh TOTP secret, stores it (encrypted-at-rest) on the AdminUser WITHOUT
 * enabling 2FA, and returns:
 *   - secret: the base32 secret (for manual entry if QR fails)
 *   - otpauthUrl: the otpauth:// URL (for debugging / custom UIs)
 *   - qrCodeDataUrl: a PNG data URL the UI renders in an <img>
 *
 * The user must then call /api/platform/2fa/verify with a 6-digit code from
 * their authenticator to actually enable 2FA. Until then, twoFactorEnabled
 * stays false and the login flow does NOT prompt for 2FA.
 *
 * Repeated calls to /setup overwrite the pending secret — the user's
 * previous unconfirmed secret is lost. This is intentional: if a user
 * starts setup, abandons it, and starts again, they get a fresh secret.
 *
 * If the user ALREADY has 2FA enabled, this endpoint returns 409 — they
 * must first disable it (via /api/platform/2fa/disable with their password)
 * before re-setting-up.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;
    if (!user) return unauthorized(); // defensive — requirePlatformAdmin covers this

    // Refuse if 2FA is already enabled.
    const freshUser = await db.adminUser.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true, email: true },
    });
    if (!freshUser) return unauthorized();
    if (freshUser.twoFactorEnabled) {
      return badRequest('2FA déjà activée. Désactivez-la d\'abord pour la reconfigurer.');
    }

    // Generate fresh secret + QR.
    const secret = generateSecret();
    const otpauthUrl = buildOtpAuthUrl(secret, freshUser.email);
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

    // Store encrypted secret. twoFactorEnabled stays false until /verify.
    await db.adminUser.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: encryptSecret(secret),
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
      },
    });

    logTwoFactorEvent('setup_initiated', { userId: user.id, email: freshUser.email });

    return NextResponse.json({
      secret, // base32 — for manual entry
      otpauthUrl,
      qrCodeDataUrl, // data:image/png;base64,...
    });
  } catch (error) {
    logger.error('2FA setup error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
