export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin, verifyPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logTwoFactorEvent } from '@/lib/two-factor';
import { logger } from '@/lib/logger';
import { internalError, unauthorized, badRequest } from '@/lib/api-errors';

/**
 * POST /api/platform/2fa/disable
 *
 * Disables 2FA for the authenticated platform admin. Requires the user's
 * current password as confirmation (defense-in-depth: a stolen auth cookie
 * alone should NOT be enough to disable 2FA — the attacker would also need
 * the password).
 *
 * Clears:
 *   - twoFactorSecret (set to null)
 *   - twoFactorEnabled (set to false)
 *   - twoFactorBackupCodes (set to null)
 *
 * Request body: `{ password: "currentpassword" }`
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;
    if (!user) return unauthorized(); // defensive

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Mot de passe requis');
    const { password } = body;
    if (!password || typeof password !== 'string') {
      return badRequest('Mot de passe requis');
    }

    const freshUser = await db.adminUser.findUnique({
      where: { id: user.id },
      select: { email: true, password: true, twoFactorEnabled: true },
    });
    if (!freshUser) return unauthorized();
    if (!freshUser.twoFactorEnabled) {
      return badRequest('2FA n\'est pas activée');
    }

    // Verify current password (defense-in-depth).
    const passwordOk = await verifyPassword(password, freshUser.password);
    if (!passwordOk) {
      return badRequest('Mot de passe incorrect');
    }

    await db.adminUser.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
      },
    });

    await writeAuditLog({
      weddingId: null,
      userId: user.id,
      action: 'PLATFORM_2FA_DISABLED',
      details: `2FA disabled for ${freshUser.email}`,
      request,
    });
    logTwoFactorEvent('disabled', { userId: user.id, email: freshUser.email });

    return NextResponse.json({ disabled: true });
  } catch (error) {
    logger.error('2FA disable error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
