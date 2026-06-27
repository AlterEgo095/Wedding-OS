export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';

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

    const updated = await db.wedding.update({
      where: { id: wedding.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });

    invalidateWeddingCache(wedding.slug);

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId: user!.id,
        action: 'PUBLISH_WEDDING',
        details: `Published wedding ${wedding.slug}`,
      },
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
