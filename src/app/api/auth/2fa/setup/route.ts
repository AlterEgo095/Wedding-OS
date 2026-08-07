export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import {
  generateSecret,
  buildOtpAuthUrl,
  generateQrCodeDataUrl,
  encryptSecret,
  logTwoFactorEvent,
} from '@/lib/two-factor';
import { writeAuditLog } from '@/lib/audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { apiSuccess, apiError, unauthorized, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/2fa/setup — P4.7 Generic 2FA setup (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// Mission 6.0 Phase 4.7 — extends 2FA to ALL admin/staff roles:
//   PLATFORM_ADMIN, SUPER_ADMIN, ORG_ADMIN, ORG_MEMBER, ORG_VIEWER,
//   ORGANIZER, RECEPTION, CONTROLLER, DESIGNER, ART_DIRECTOR.
//
// Unlike the legacy `/api/platform/2fa/setup` (PLATFORM_ADMIN-only), this
// endpoint accepts ANY authenticated admin/staff user. The role-based RBAC
// already happens upstream via the `auth_token` cookie verification in
// `getAuthUser` — only users with a valid AdminUser row in the DB can reach
// the body of this handler.
//
// Contract:
//   - POST, requires valid `auth_token` cookie (any admin/staff role).
//   - 5 setup attempts / minute per IP (withRateLimit).
//   - Body: empty (`{}`) — no input required.
//   - If 2FA already enabled → 409 Conflict (must disable first).
//   - Generates a fresh TOTP secret (otplib), stores it encrypted-at-rest
//     on `AdminUser.twoFactorSecret` (twoFactorEnabled stays false).
//   - Returns `{ secret, otpauthUrl, qrCodeDataUrl }` so the UI can show
//     the QR + manual-entry secret.
//
// Repeated calls overwrite the pending unconfirmed secret. The user must
// then call `/api/auth/2fa/verify` with a 6-digit code to actually enable.

const SetupBodySchema = z.object({}).optional();

export const POST = withRateLimit(5, 60_000)(
  async (request: NextRequest) => {
    try {
      const user = await getAuthUser(request);
      if (!user) return unauthorized();

      // Refuse if 2FA is already enabled — caller must disable first.
      const freshUser = await db.adminUser.findUnique({
        where: { id: user.id },
        select: { twoFactorEnabled: true, email: true, role: true },
      });
      if (!freshUser) return unauthorized();
      if (freshUser.twoFactorEnabled) {
        return apiError('2FA déjà activée. Désactivez-la d\'abord pour la reconfigurer.', 409);
      }

      // Body validation (empty body OK).
      const body = await request.json().catch(() => ({}));
      const parsed = SetupBodySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest('Corps de requête invalide');
      }

      // Generate fresh secret + QR data URL.
      const secret = generateSecret();
      const otpauthUrl = buildOtpAuthUrl(secret, freshUser.email);
      const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

      // Store encrypted secret (twoFactorEnabled stays false until /verify).
      await db.adminUser.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: encryptSecret(secret),
          twoFactorEnabled: false,
          twoFactorBackupCodes: null,
        },
      });

      // Best-effort audit + structured log.
      await writeAuditLog({
        weddingId: user.weddingId ?? null,
        userId: user.id,
        action: 'TWO_FACTOR_SETUP_INITIATED',
        details: `2FA setup initiated for ${freshUser.email} (role=${freshUser.role})`,
        request,
      }).catch(() => { /* audit failure is non-fatal */ });
      logTwoFactorEvent('setup_initiated', { userId: user.id, email: freshUser.email, role: freshUser.role });

      return apiSuccess({
        secret, // base32 — for manual entry
        otpauthUrl,
        qrCodeDataUrl, // data:image/png;base64,...
      });
    } catch (error) {
      logger.error('2FA setup (generic) error', {
        errMessage: error instanceof Error ? error.message : String(error),
        errName: error instanceof Error ? error.name : 'Unknown',
      });
      return apiError('Erreur interne du serveur', 500);
    }
  }
);
