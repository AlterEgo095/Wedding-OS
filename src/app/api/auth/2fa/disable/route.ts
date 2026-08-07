export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, verifyPassword } from '@/lib/auth';
import { logTwoFactorEvent } from '@/lib/two-factor';
import { writeAuditLog } from '@/lib/audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError, unauthorized, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/2fa/disable — P4.7 Disable 2FA (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// Disables 2FA for the authenticated admin/staff user. Requires the user's
// current password as confirmation (defense-in-depth: a stolen auth cookie
// alone should NOT be enough to disable 2FA — the attacker would also need
// the password).
//
// Clears:
//   - twoFactorSecret (set to null)
//   - twoFactorEnabled (set to false)
//   - twoFactorBackupCodes (set to null)
//
// Contract:
//   - POST, requires valid `auth_token` cookie (any admin/staff role).
//   - 5 disable attempts / minute per IP.
//   - Body: `{ password: "currentpassword" }` (Zod-validated).

const DisableBodySchema = z.object({
  password: z.string().min(1, 'Mot de passe requis'),
});

export const POST = withRateLimit(5, 60_000)(
  async (request: NextRequest) => {
    try {
      const user = await getAuthUser(request);
      if (!user) return unauthorized();

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Mot de passe requis');
      const parsed = DisableBodySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Mot de passe requis');
      }
      const { password } = parsed.data;

      const freshUser = await db.adminUser.findUnique({
        where: { id: user.id },
        select: { email: true, role: true, password: true, twoFactorEnabled: true },
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
        weddingId: user.weddingId ?? null,
        userId: user.id,
        action: 'TWO_FACTOR_DISABLED',
        details: `2FA disabled for ${freshUser.email} (role=${freshUser.role})`,
        request,
      }).catch(() => { /* audit failure is non-fatal */ });
      logTwoFactorEvent('disabled', { userId: user.id, email: freshUser.email, role: freshUser.role });

      return apiSuccess({ disabled: true });
    } catch (error) {
      logger.error('2FA disable (generic) error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return apiError('Erreur interne du serveur', 500);
    }
  }
);
