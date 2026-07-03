export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import {
  transitionCollection,
  availableTransitions,
  COLLECTION_STATUSES,
  COLLECTION_STATUS_LABELS,
  ApplyError,
  type CollectionStatus,
} from '@/lib/collections';

/**
 * GET /api/collections/[id]/transition — list transitions available for the
 * caller's role, given the Collection's current status.
 *
 * Auth: any authenticated user (the response is filtered by role — a designer
 * will only see designer-allowed transitions, etc.).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return withAdminTenantHandler(request, user, async () => {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const { db } = await import('@/lib/db');
      const collection = await db.collection.findUnique({
        where: { id },
        select: { id: true, slug: true, name: true, status: true, version: true },
      });
      if (!collection) {
        return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 });
      }

      const from = collection.status as CollectionStatus;
      const transitions = availableTransitions(from, user.role);
      return NextResponse.json({
        collection: {
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          status: from,
          statusLabel: COLLECTION_STATUS_LABELS[from],
          version: collection.version,
        },
        transitions,
        statuses: COLLECTION_STATUSES.map((s) => ({
          value: s,
          label: COLLECTION_STATUS_LABELS[s],
        })),
      });
    });
  } catch (error) {
    console.error('Get transitions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/collections/[id]/transition — trigger a lifecycle transition.
 *
 * Body: { to: CollectionStatus }
 *
 * Auth: any authenticated user, but transitionCollection enforces role-based
 * permission via the TRANSITION_ROLES matrix (spec §3.3).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return withAdminTenantHandler(request, user, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const body = await request.json();
      const { to } = body as { to?: CollectionStatus };

      if (!to || !COLLECTION_STATUSES.includes(to)) {
        return NextResponse.json(
          { error: `Statut invalide: ${to}. Valeurs attendues: ${COLLECTION_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      const result = await transitionCollection({
        collectionId: id,
        to,
        userRole: user.role,
        userId: user.id,
        weddingId: user.weddingId,
      });

      return NextResponse.json({
        success: true,
        from: result.from,
        to: result.to,
        fromLabel: COLLECTION_STATUS_LABELS[result.from],
        toLabel: COLLECTION_STATUS_LABELS[result.to],
        version: result.version,
      });
    } catch (error) {
      // Duck-type check (instanceof fails under Turbopack due to module duplication).
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
      ) {
        const e = error as { statusCode: number; message: string };
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
      }
      console.error('Transition error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
