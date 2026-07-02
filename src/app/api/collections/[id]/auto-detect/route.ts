export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import { hasRole } from '@/lib/types';
import {
  autoMapModules,
  linkPenpotFile,
  ApplyError,
  type AutoMapEntry,
} from '@/lib/collections';
import { detectFramesFromPenpotFile } from '@/lib/penpot/autoDetect';
import { describePenpotClientState } from '@/lib/penpot/client';

/**
 * POST /api/collections/[id]/auto-detect — run Penpot auto-detection on a Collection.
 *
 * Phase 5 — Penpot Collection Builder.
 *
 * Body: {
 *   fileUrl?: string,           // Required on first run. Subsequent runs reuse the
 *                               // Collection.penpotFileUrl if omitted.
 *   tokenId?: string | null,    // Optional designer-scoped Penpot API token
 *   applyMapping?: boolean,     // Default true — write the matched frames to
 *                               // CollectionModule rows. Set false to dry-run
 *                               // (just return the DetectionReport without writing).
 *   overrideManual?: boolean,   // Default false — preserve manual overrides.
 *                               // Set true to overwrite manual mappings too.
 *   forcePageId?: string | null // Optional page filter (overrides URL's page-id)
 * }
 *
 * Auth: DESIGNER+ (covers ART_DIRECTOR, PLATFORM_ADMIN, SUPER_ADMIN via hierarchy).
 *
 * Response (200): {
 *   report: DetectionReport,
 *   mapping: AutoMapResult | null,  // null when applyMapping=false
 *   clientState: string             // human-readable Penpot client state
 * }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(user.role, ['DESIGNER'])) {
    return NextResponse.json(
      { error: 'Forbidden — réservé aux designers, directeurs artistiques et administrateurs plateforme' },
      { status: 403 }
    );
  }

  return withAdminTenantHandler(request, user, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const body = await request.json().catch(() => ({})) as {
        fileUrl?: string;
        tokenId?: string | null;
        applyMapping?: boolean;
        overrideManual?: boolean;
        forcePageId?: string | null;
      };

      // 1. Resolve the Penpot URL: use body.fileUrl OR fetch from DB
      let fileUrl = body.fileUrl;
      let tokenId = body.tokenId;

      if (!fileUrl) {
        const { db } = await import('@/lib/db');
        const collection = await db.collection.findUnique({
          where: { id },
          select: { penpotFileUrl: true, penpotTokenId: true },
        });
        if (!collection) {
          return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 });
        }
        if (!collection.penpotFileUrl) {
          return NextResponse.json(
            { error: 'Aucune URL Penpot liée à cette Collection. Passez fileUrl dans le body ou liez d\'abord via /api/collections/[id]/penpot-link.' },
            { status: 400 }
          );
        }
        fileUrl = collection.penpotFileUrl;
        // Inherit token from Collection if not overridden
        if (tokenId === undefined) tokenId = collection.penpotTokenId;
      } else {
        // First-time link: persist the URL + token on the Collection
        await linkPenpotFile({ collectionId: id, fileUrl, tokenId: tokenId ?? null });
      }

      // 2. Run auto-detection (pure orchestration, no DB writes)
      const report = await detectFramesFromPenpotFile(fileUrl, {
        forcePageId: body.forcePageId,
      });

      // 3. Optional: apply the mapping to CollectionModule rows
      const applyMapping = body.applyMapping !== false; // default true
      let mapping = null;
      if (applyMapping && report.errors.length === 0) {
        const entries: AutoMapEntry[] = report.entries.map((e) => ({
          frameId: e.frameId,
          frameName: e.frameName,
          pageId: e.pageId,
          matched: e.matched,
          pack: e.pack,
          slot: e.slot,
        }));
        try {
          mapping = await autoMapModules(id, entries, {
            overrideManual: body.overrideManual ?? false,
          });
        } catch (e) {
          // Mapping failed — still return the report so the designer can see why
          if (e instanceof ApplyError) {
            return NextResponse.json(
              {
                error: e.message,
                report,
                mapping: null,
                clientState: describePenpotClientState(),
              },
              { status: e.statusCode }
            );
          }
          throw e;
        }
      }

      // 4. Recompute + cache the quality score (best-effort, non-blocking)
      let quality = null;
      if (mapping) {
        try {
          const { computeQualityScore } = await import('@/lib/collections/quality');
          quality = await computeQualityScore(id, { skipCache: false });
        } catch (err) {
          console.warn('Quality score recompute failed (non-blocking):', err);
        }
      }

      return NextResponse.json({
        report,
        mapping,
        quality,
        clientState: describePenpotClientState(),
      });
    } catch (error) {
      console.error('Auto-detect error:', error);
      return NextResponse.json(
        { error: 'Erreur lors de l\'auto-détection Penpot' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/collections/[id]/auto-detect — dry-run detection (no writes).
 *
 * Same as POST with applyMapping=false. Useful for the Designer Portal to
 * preview what would be detected before committing the mapping.
 */
export async function GET(request: NextRequest) {
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
      const { db } = await import('@/lib/db');
      const collection = await db.collection.findUnique({
        where: { id },
        select: { penpotFileUrl: true },
      });
      if (!collection) {
        return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 });
      }
      if (!collection.penpotFileUrl) {
        return NextResponse.json(
          { error: 'Aucune URL Penpot liée à cette Collection' },
          { status: 400 }
        );
      }

      const report = await detectFramesFromPenpotFile(collection.penpotFileUrl);
      return NextResponse.json({
        report,
        mapping: null,
        clientState: describePenpotClientState(),
      });
    } catch (error) {
      console.error('Auto-detect GET error:', error);
      return NextResponse.json(
        { error: 'Erreur lors de l\'auto-détection Penpot' },
        { status: 500 }
      );
    }
  });
}
