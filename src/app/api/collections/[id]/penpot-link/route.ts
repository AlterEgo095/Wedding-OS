export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import { hasRole } from '@/lib/types';
import { linkPenpotFile, unlinkPenpotFile, ApplyError } from '@/lib/collections';

/**
 * POST /api/collections/[id]/penpot-link — link a Penpot file URL to a Collection.
 *
 * Phase 5 — Penpot Collection Builder.
 *
 * Body: {
 *   fileUrl: string,         // Penpot URL (view/share/editor — parsePenpotUrl accepts all)
 *   tokenId?: string | null  // Optional designer-scoped Penpot API token
 * }
 *
 * Auth: DESIGNER+ (covers ART_DIRECTOR, PLATFORM_ADMIN, SUPER_ADMIN via hierarchy).
 *
 * Idempotent — re-linking with the same URL is a no-op (only updates tokenId if changed).
 *
 * Response (200): {
 *   collectionId: string,
 *   fileId: string | null,  // parsed from URL; null = invalid URL
 *   pageId: string | null
 * }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(user.role, ['DESIGNER'])) {
    return NextResponse.json(
      { error: 'Forbidden — réservé aux designers+' },
      { status: 403 }
    );
  }

  return withAdminTenantHandler(request, user, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const body = await request.json();
      const { fileUrl, tokenId } = body as {
        fileUrl?: string;
        tokenId?: string | null;
      };

      if (!fileUrl || typeof fileUrl !== 'string') {
        return NextResponse.json(
          { error: 'fileUrl est requis (URL Penpot complète)' },
          { status: 400 }
        );
      }

      try {
        const result = await linkPenpotFile({
          collectionId: id,
          fileUrl,
          tokenId: tokenId ?? null,
        });
        return NextResponse.json(result);
      } catch (e) {
        if (e instanceof ApplyError) {
          return NextResponse.json({ error: e.message }, { status: e.statusCode });
        }
        throw e;
      }
    } catch (error) {
      console.error('Penpot link error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

/**
 * DELETE /api/collections/[id]/penpot-link — unlink the Penpot file from a Collection.
 *
 * Phase 5 — Penpot Collection Builder.
 *
 * Sets penpotFileUrl + penpotFileId + penpotTokenId to null.
 * Does NOT touch CollectionModule rows — auto-mapped slots remain mapped
 * (the designer can re-sync or manually unmap them).
 *
 * Auth: DESIGNER+ (covers ART_DIRECTOR, PLATFORM_ADMIN, SUPER_ADMIN via hierarchy).
 */
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(user.role, ['DESIGNER'])) {
    return NextResponse.json(
      { error: 'Forbidden — réservé aux designers+' },
      { status: 403 }
    );
  }

  return withAdminTenantHandler(request, user, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const result = await unlinkPenpotFile(id);
      return NextResponse.json(result);
    } catch (error) {
      console.error('Penpot unlink error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
