export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tenantDb } from '@/lib/db';
import {
  validateGuestSession,
  getClientInfo,
  logGuestAccess,
} from '@/lib/guest-auth';
import { resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

// ══════════════════════════════════════════════════════════════════════════════
// /api/guest/me/dietary — Guest self-service dietary preferences — P4.2
// ══════════════════════════════════════════════════════════════════════════════
//
// GET  /api/guest/me/dietary
//    → 200 { dietary }
//
//    Returns the current guest's dietary preference text (or null if unset).
//
// PUT  /api/guest/me/dietary  { dietary: string }
//    → 200 { dietary }
//
//    Updates the current guest's dietary preference. Free-form text up to
//    500 chars (allergies, restrictions, preferences, etc.). Empty string
//    or null clears the field.
//
//    Audit log: action='guest.dietary_update' (wedding-scoped via tenantDb).
//
// Auth: guest session cookie (guest_session). Tenant is resolved from the
// request via resolvePublicTenant (slug from header/query/default).
// ══════════════════════════════════════════════════════════════════════════════

const dietarySchema = z.object({
  dietary: z
    .string()
    .max(500, 'Le texte ne peut pas dépasser 500 caractères')
    .nullable()
    .optional(),
});

async function resolveGuest(request: NextRequest) {
  const token = request.cookies.get('guest_session')?.value;
  if (!token) return null;
  const clientInfo = getClientInfo(request);
  const session = await validateGuestSession(
    token,
    clientInfo.userAgent,
    clientInfo.ipAddress
  );
  if (!session.valid || !session.guestId) return null;
  return { guestId: session.guestId, clientInfo };
}

export async function GET(request: NextRequest) {
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      const resolved = await resolveGuest(request);
      if (!resolved) {
        return NextResponse.json(
          { error: 'Non authentifié', authenticated: false },
          { status: 401 }
        );
      }

      // findFirst so the tenant extension auto-scopes to the current wedding
      // (defense-in-depth: even if a guestId is leaked cross-tenant, the
      // extension adds weddingId to the where clause and returns null).
      const guest = await tenantDb.guest.findFirst({
        where: { id: resolved.guestId },
        select: { id: true, dietary: true, firstName: true, lastName: true },
      });
      if (!guest) {
        return NextResponse.json(
          { error: 'Invité non trouvé', authenticated: false },
          { status: 404 }
        );
      }

      return NextResponse.json({ dietary: guest.dietary });
    } catch (error) {
      logger.error('Guest dietary GET error', {
        errMessage: error instanceof Error ? error.message : String(error),
      });
      return internalError();
    }
  });
}

async function putHandler(request: NextRequest) {
  const { context, error: tenantError } = await resolvePublicTenant(request);
  if (tenantError || !context) {
    return NextResponse.json(
      { error: tenantError?.message ?? 'Tenant resolution failed' },
      { status: tenantError?.status ?? 500 }
    );
  }

  return runWithTenant(context, async () => {
    try {
      const resolved = await resolveGuest(request);
      if (!resolved) {
        return NextResponse.json(
          { error: 'Non authentifié', authenticated: false },
          { status: 401 }
        );
      }

      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Corps de requête invalide');

      const parsed = dietarySchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(
          parsed.error.issues[0]?.message || 'Données invalides'
        );
      }

      // Normalize: trim, empty string → null
      const dietaryRaw = parsed.data.dietary ?? null;
      const dietary =
        typeof dietaryRaw === 'string' && dietaryRaw.trim().length > 0
          ? dietaryRaw.trim()
          : null;

      // findFirst then update — auto-scoped by tenant extension.
      const existing = await tenantDb.guest.findFirst({
        where: { id: resolved.guestId },
        select: { id: true, dietary: true, firstName: true, lastName: true },
      });
      if (!existing) {
        return NextResponse.json(
          { error: 'Invité non trouvé', authenticated: false },
          { status: 404 }
        );
      }

      await tenantDb.guest.update({
        where: { id: resolved.guestId },
        data: { dietary },
      });

      // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: context.weddingId,
        userId: null, // guest action, not admin
        action: 'guest.dietary_update',
        details: `Guest ${existing.firstName} ${existing.lastName} updated dietary preferences (from ${existing.dietary ? `'${existing.dietary.slice(0, 60)}'` : 'null'} to ${dietary ? `'${dietary.slice(0, 60)}'` : 'null'})`,
        request,
      });

      // Log guest access event for security monitoring (best-effort).
      logGuestAccess({
        guestId: resolved.guestId,
        action: 'DIETARY_UPDATE',
        details: dietary ? `Set dietary preferences (${dietary.length} chars)` : 'Cleared dietary preferences',
        ...resolved.clientInfo,
      }).catch(() => {});

      return NextResponse.json({ dietary });
    } catch (error) {
      logger.error('Guest dietary PUT error', {
        errMessage: error instanceof Error ? error.message : String(error),
      });
      return internalError();
    }
  });
}

// Note: rate limiting is intentionally NOT applied here. The guest portal uses
// a 30-day httpOnly sameSite=strict session cookie, so the surface area for
// abuse is limited to authenticated guests. If abuse is observed, a per-guest
// rate limit can be added via withRateLimit with a guestId-based keyFn.
export const PUT = putHandler;
