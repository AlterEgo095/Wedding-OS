export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import {
  verifyToken,
  decryptSecret,
  generateBackupCodes,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, unauthorized, badRequest } from '@/lib/api-errors';

/**
 * POST /api/platform/2fa/verify
 *
 * Confirms 2FA setup by verifying a 6-digit TOTP code from the user's
 * authenticator against the pending secret stored at /setup time. On
 * success:
 *   - Sets `twoFactorEnabled = true`.
 *   - Generates 8 one-time backup codes, stores their SHA-256 hashes in
 *     `twoFactorBackupCodes`, returns the plaintext codes in the response
 *     (one-time display — user must save them).
 *
 * On next login, /api/platform/login will detect twoFactorEnabled and
 * return a challenge token instead of setting the auth cookie.
 *
 * Request body: `{ token: "123456" }`
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;
    if (!user) return unauthorized(); // defensive

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Code TOTP requis');
    const { token } = body;
    if (!token || typeof token !== 'string') {
      return badRequest('Code TOTP requis');
    }

    const freshUser = await db.adminUser.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        twoFactorSecret: true,
        twoFactorEnabled: true,
      },
    });
    if (!freshUser) return unauthorized();
    if (freshUser.twoFactorEnabled) {
      return badRequest('2FA déjà activée');
    }
    if (!freshUser.twoFactorSecret) {
      return badRequest('Aucun secret 2FA en attente. Appelez /api/platform/2fa/setup d\'abord.');
    }

    const secret = decryptSecret(freshUser.twoFactorSecret);
    if (!secret) {
      // Decryption failed — the stored secret is corrupt or the env key
      // changed. Reset the secret so the user can re-setup.
      await db.adminUser.update({
        where: { id: user.id },
        data: { twoFactorSecret: null },
      });
      return badRequest('Secret 2FA illisible. Veuillez reconfigurer la 2FA.');
    }

    if (!verifyToken(token, secret)) {
      return badRequest('Code TOTP invalide');
    }

    // Generate backup codes (8 × 8 hex chars, formatted as xxxx-xxxx).
    const { plaintext: backupCodes, hashed: hashedBackupCodes } = generateBackupCodes();

    await db.adminUser.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: JSON.stringify(hashedBackupCodes),
      },
    });

    await writeAuditLog({
      weddingId: null,
      userId: user.id,
      action: 'PLATFORM_2FA_ENABLED',
      details: `2FA enabled for ${freshUser.email}`,
      request,
    });
    logTwoFactorEvent('enabled', { userId: user.id, email: freshUser.email });

    return NextResponse.json({
      enabled: true,
      backupCodes, // plaintext — one-time display
      message: 'Conservez ces codes de secours dans un endroit sûr. Chaque code ne peut être utilisé qu\'une fois.',
    });
  } catch (error) {
    logger.error('2FA verify error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
