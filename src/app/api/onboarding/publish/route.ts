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
// Mission 6.0 P0.5 — route all publications through the deployment pipeline
// so every PUBLISHED wedding has a Deployment row (visible in Production Studio).
import { publishWeddingViaPipeline } from '@/lib/pipeline/publish-helper';
// P2.6 — auto-transition commercialStatus PAID → LIVE when the wedding is
// published. Idempotent: no-op if not PUBLISHED, or commercialStatus is
// already LIVE / not in [PAID, READY, IN_PRODUCTION].
import { autoTransitionToLive } from '@/lib/commercial-status';

/**
 * POST /api/onboarding/publish    (PLATFORM_ADMIN)
 *
 * Publish a previously-drafted wedding created via the onboarding wizard.
 * Sets status='PUBLISHED' + publishedAt=now() + invalidates the slug cache so
 * the next /w/{slug} request resolves the live wedding.
 *
 * P2.6 — After a successful publish, auto-transitions the wedding's
 * commercialStatus from PAID/READY/IN_PRODUCTION → LIVE. This bridges the
 * two state machines (Wedding.status + Wedding.commercialStatus) so they
 * no longer drift silently.
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
      select: { id: true, slug: true, status: true, publishedAt: true, commercialStatus: true, isDefault: true },
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

    // Mission 5.6 FIX-A: enforce PUBLISHED->PAID invariant (same as platform weddings/[id] PUT).
    // Demo weddings (isDefault=true) are exempt.
    if (!wedding.isDefault && wedding.commercialStatus !== 'PAID') {
      return NextResponse.json(
        {
          error: 'Publication refusee : le paiement doit etre verifie avant activation. Utilisez Commercial OS -> Payments -> verify.',
          code: 'PUBLISHED_REQUIRES_PAID',
          currentCommercialStatus: wedding.commercialStatus,
        },
        { status: 403 },
      );
    }

    // Mission 6.0 P0.5 — publish via the deployment pipeline (no more bypass).
    // This creates a Deployment row + publishedConfigJson snapshot.
    const publishResult = await publishWeddingViaPipeline(wedding.id, user!.id);

    if (!publishResult.success) {
      return NextResponse.json(
        { error: 'Échec de la publication via le pipeline de déploiement.', code: 'PUBLISH_FAILED', detail: publishResult.error },
        { status: 500 },
      );
    }

    const updated = await db.wedding.findUnique({
      where: { id: wedding.id },
      select: { id: true, slug: true, status: true, publishedAt: true, commercialStatus: true },
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

    // P2.6 — Bridge the two state machines: now that Wedding.status is
    // PUBLISHED, auto-flip commercialStatus PAID → LIVE (idempotent —
    // no-op if already LIVE or if commercialStatus is not in the allowed
    // source set). Errors here MUST NOT fail the publish — the wedding is
    // already public. We log and continue.
    try {
      await autoTransitionToLive(wedding.id, user!.id);
    } catch (e) {
      console.error('[publish] autoTransitionToLive failed (non-blocking):', e);
    }

    return NextResponse.json({ wedding: updated, deployment: { id: publishResult.deploymentId, version: publishResult.version, mode: publishResult.mode } });
  } catch (error) {
    console.error('Publish wedding error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
