export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { generateBackupCodes, logTwoFactorEvent } from '@/lib/two-factor';
import { writeAuditLog } from '@/lib/audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError, unauthorized, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/2fa/backup-codes/regenerate — P4.7
// ══════════════════════════════════════════════════════════════════════════════
//
// Regenerates the user's 8 one-time backup codes. The previous set is
// invalidated immediately (replaced in DB). The new plaintext codes are
// returned in the response body — ONE-TIME display, the user must save
// them now (download or print) because they cannot be retrieved again.
//
// Contract:
//   - POST, requires valid `auth_token` cookie (any admin/staff role).
//   - User MUST have 2FA enabled (else 400).
//   - 3 regenerations / minute per IP (sensitive — invalidates old codes).
//   - Body: empty (`{}`) — no input required.
//   - Returns `{ backupCodes: string[] }`.
//   - Audit log action: `2fa.backup_codes_regenerated` (lowercase dotted
//     convention used for the generic 2FA family, matching the pattern
//     documented in src/lib/audit.ts).

const RegenBodySchema = z.object({}).optional();

export const POST = withRateLimit(3, 60_000)(
  async (request: NextRequest) => {
    try {
      const user = await getAuthUser(request);
      if (!user) return unauthorized();

      const body = await request.json().catch(() => ({}));
      const parsed = RegenBodySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest('Corps de requête invalide');
      }

      const freshUser = await db.adminUser.findUnique({
        where: { id: user.id },
        select: { email: true, role: true, twoFactorEnabled: true },
      });
      if (!freshUser) return unauthorized();
      if (!freshUser.twoFactorEnabled) {
        return badRequest('2FA n\'est pas activée. Activez-la d\'abord.');
      }

      // Generate fresh backup codes (8 × xxxx-xxxx, stored as SHA-256 hashes).
      const { plaintext: backupCodes, hashed: hashedBackupCodes } = generateBackupCodes();

      // Atomically replace the stored hashes — the previous set is
      // invalidated even if the response is lost in transit.
      await db.adminUser.update({
        where: { id: user.id },
        data: { twoFactorBackupCodes: JSON.stringify(hashedBackupCodes) },
      });

      await writeAuditLog({
        weddingId: user.weddingId ?? null,
        userId: user.id,
        action: '2fa.backup_codes_regenerated',
        details: `Backup codes regenerated for ${freshUser.email} (role=${freshUser.role})`,
        request,
      }).catch(() => { /* audit failure is non-fatal */ });
      logTwoFactorEvent('backup_codes_regenerated', {
        userId: user.id,
        email: freshUser.email,
        role: freshUser.role,
      });

      return apiSuccess({
        backupCodes, // plaintext — one-time display
        message: 'Les anciens codes de secours ne sont plus valides. Conservez ces nouveaux codes dans un endroit sûr.',
      });
    } catch (error) {
      logger.error('2FA backup-codes regenerate error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return apiError('Erreur interne du serveur', 500);
    }
  }
);
