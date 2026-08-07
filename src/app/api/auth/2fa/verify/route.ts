export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import {
  verifyToken,
  decryptSecret,
  generateBackupCodes,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { writeAuditLog } from '@/lib/audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError, unauthorized, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/2fa/verify — P4.7 Confirm 2FA setup (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// Confirms 2FA setup by verifying a 6-digit TOTP code from the user's
// authenticator against the pending secret stored at /setup time. On success:
//   - Sets `twoFactorEnabled = true`.
//   - Generates 8 one-time backup codes, stores their SHA-256 hashes in
//     `twoFactorBackupCodes`, returns the plaintext codes in the response
//     (one-time display — user must save them).
//
// Contract:
//   - POST, requires valid `auth_token` cookie (any admin/staff role).
//   - 10 verify attempts / minute per IP.
//   - Body: `{ token: "123456" }` (Zod-validated).
//   - If already enabled → 409.
//   - If no pending secret → 400 ("call /setup first").
//   - If decrypt fails → 400 + resets the stored secret.
//   - If TOTP mismatch → 400 ("Code TOTP invalide").

const VerifyBodySchema = z.object({
  token: z.string().regex(/^\d{6}$/, 'Le code TOTP doit comporter 6 chiffres'),
});

export const POST = withRateLimit(10, 60_000)(
  async (request: NextRequest) => {
    try {
      const user = await getAuthUser(request);
      if (!user) return unauthorized();

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Code TOTP requis');
      const parsed = VerifyBodySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Code TOTP invalide');
      }
      const { token } = parsed.data;

      const freshUser = await db.adminUser.findUnique({
        where: { id: user.id },
        select: {
          email: true,
          role: true,
          twoFactorSecret: true,
          twoFactorEnabled: true,
        },
      });
      if (!freshUser) return unauthorized();
      if (freshUser.twoFactorEnabled) {
        return apiError('2FA déjà activée', 409);
      }
      if (!freshUser.twoFactorSecret) {
        return badRequest('Aucun secret 2FA en attente. Appelez /api/auth/2fa/setup d\'abord.');
      }

      const secret = decryptSecret(freshUser.twoFactorSecret);
      if (!secret) {
        // Decryption failed — stored secret is corrupt or env key changed.
        // Reset so the user can re-setup cleanly.
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
        weddingId: user.weddingId ?? null,
        userId: user.id,
        action: 'TWO_FACTOR_ENABLED',
        details: `2FA enabled for ${freshUser.email} (role=${freshUser.role})`,
        request,
      }).catch(() => { /* audit failure is non-fatal */ });
      logTwoFactorEvent('enabled', { userId: user.id, email: freshUser.email, role: freshUser.role });

      return apiSuccess({
        enabled: true,
        backupCodes, // plaintext — one-time display
        message: 'Conservez ces codes de secours dans un endroit sûr. Chaque code ne peut être utilisé qu\'une fois.',
      });
    } catch (error) {
      logger.error('2FA verify (generic) error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return apiError('Erreur interne du serveur', 500);
    }
  }
);
