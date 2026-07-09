// ══════════════════════════════════════════════════════════════════════════════
// POST /api/design/compile-invitation — Mission 5.7.1 Phase 6
// ══════════════════════════════════════════════════════════════════════════════
//
// First Vertical Slice: compile a master-driven invitation from the golden
// fixture + real wedding + real guest + real QR.
//
// Auth: PLATFORM_ADMIN only (factory tool — never exposed to clients/organizers).
//
// Body: { weddingId: string, guestId: string, format?: 'PNG' | 'PDF' }
// Returns: { html, validation, metadata, resolvedBindings }
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { GOLDEN_INVITATION_FIXTURE } from '@/lib/design/golden-fixture';
import { buildBindingContext } from '@/lib/design/mapping-engine';
import { compileProduct } from '@/lib/design/product-compiler';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { weddingId, guestId, format } = body as {
      weddingId?: string;
      guestId?: string;
      format?: string;
    };

    if (!weddingId) return badRequest('weddingId requis');
    if (!guestId) return badRequest('guestId requis');

    // 1. Build the binding context from REAL Wedding + Guest + Table + QR
    const ctx = await buildBindingContext(weddingId, guestId);

    // 2. Compile the product using the golden fixture (TEST_ONLY)
    //    When PenpotAdapter arrives, GOLDEN_INVITATION_FIXTURE will be replaced
    //    by a real CanonicalDesignPackage from PenpotAdapter — zero downstream change.
    const product = compileProduct(
      GOLDEN_INVITATION_FIXTURE,
      ctx,
      'DIGITAL_INVITATION',
      format || 'PNG',
    );

    // 3. Log the compilation
    logger.info('Master-driven invitation compiled', {
      weddingId,
      guestId,
      sourceHash: product.metadata.sourceHash,
      valid: product.validation.valid,
      resolvedBindings: product.validation.resolvedBindings,
      totalBindings: product.validation.totalBindings,
      format: product.metadata.format,
    });

    return NextResponse.json({
      success: true,
      product,
    });
  } catch (error) {
    logger.error('Compile invitation error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
