// POST /api/design/export — Mission 5.7.2 Phase 7+8
// Produces REAL PNG and PDF files from a master-driven invitation.
// Auth: PLATFORM_ADMIN only.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { reloadDesignFromDb } from '@/lib/design/master-lifecycle';
import { buildBindingContext, resolveBindings } from '@/lib/design/mapping-engine';
import { exportInvitation } from '@/lib/design/export-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { collectionId, weddingId, guestId, formats } = body as {
      collectionId?: string;
      weddingId?: string;
      guestId?: string;
      formats?: string[];
    };

    if (!collectionId) return badRequest('collectionId requis');
    if (!weddingId) return badRequest('weddingId requis');
    if (!guestId) return badRequest('guestId requis');

    // 1. RELOAD design from database (not from fixture directly)
    const pkg = await reloadDesignFromDb(collectionId);
    if (!pkg) {
      return badRequest('Aucun design ingéré pour cette collection. Ingérez d\'abord via POST /api/design/ingest');
    }

    // 2. Build binding context from real Wedding + Guest + Table + QR
    const ctx = await buildBindingContext(weddingId, guestId);

    // 3. Resolve bindings
    const resolved = resolveBindings(pkg.bindings, ctx);

    // 4. Produce REAL PNG/PDF files
    const fmts = (formats || ['PNG', 'PDF']).filter((f) => f === 'PNG' || f === 'PDF') as ('PNG' | 'PDF')[];
    const result = await exportInvitation(pkg, ctx, resolved, {
      weddingId,
      guestId,
      collectionId,
      formats: fmts,
      userId: user!.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Export error', { errMessage: error instanceof Error ? error.message : String(error) });
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
