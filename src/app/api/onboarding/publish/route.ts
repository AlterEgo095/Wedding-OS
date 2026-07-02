export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';
// Phase 3 ÉTAPE 6: use the shared lifecycle matrix so this route can no
// longer bypass the transition rules (e.g. it used to allow
// COMPLETED → PUBLISHED and ARCHIVED → PUBLISHED, which the canonical
// /api/platform/weddings/[id] route rejects).
import { isValidTransition, getAllowedTransitions } from '@/lib/wedding-status';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * POST /api/onboarding/publish    (PLATFORM_ADMIN)
 *
 * Publish a previously-drafted wedding created via the onboarding wizard.
 * Sets status='PUBLISHED' + publishedAt=now() + invalidates the slug cache so
 * the next /w/{slug} request resolves the live wedding.
 *
 * Body:
 *   { weddingId: string }
 *
 * Returns:
 *   200 { wedding: { id, slug, status, publishedAt } }
 *   404 if wedding not found
 *   400 if already published
 */

interface PublishBody {
  weddingId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as PublishBody | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }

    const { weddingId } = body;
    if (typeof weddingId !== 'string' || !weddingId.trim()) {
      return NextResponse.json(
        { error: 'weddingId est requis.' },
        { status: 400 },
      );
    }

    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
    if (!wedding) {
      return NextResponse.json(
        { error: 'Mariage introuvable.' },
        { status: 404 },
      );
    }

    if (wedding.status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Ce mariage est déjà publié.' },
        { status: 400 },
      );
    }

    // Phase 3 ÉTAPE 6: validate the transition against the canonical matrix.
    // The previous code unconditionally set status='PUBLISHED', which allowed
    // illegal transitions like COMPLETED → PUBLISHED or ARCHIVED → PUBLISHED.
    // Now we reject those with the same payload shape as the platform route.
    if (!isValidTransition(wedding.status, 'PUBLISHED')) {
      return NextResponse.json(
        {
          error: `Transition invalide: ${wedding.status} → PUBLISHED.`,
          from: wedding.status,
          to: 'PUBLISHED',
          allowed: getAllowedTransitions(wedding.status),
        },
        { status: 400 },
      );
    }

    const updated = await db.wedding.update({
      where: { id: wedding.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });

    invalidateWeddingCache(wedding.slug);

    // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: null,
      userId: user!.id,
      action: 'PUBLISH_WEDDING',
      details: `Published wedding ${wedding.slug}`,
      request,
    });

    return NextResponse.json({ wedding: updated });
  } catch (error) {
    console.error('Publish wedding error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
