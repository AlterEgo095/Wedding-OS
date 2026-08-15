export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { checkMediaLimit } from '@/lib/plan-limits';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
// P2-SEC-6: rate-limit HOF.
import { withRateLimit } from '@/lib/rate-limit';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P2.4: usage metering (MEDIA_BYTES counter increment after successful upload).
import { incrementUsage } from '@/lib/usage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// SECURITY (P1-SEC-13): SVG removed from allowed list — SVG can carry
// inline <script> tags and event handlers that execute as same-origin JS
// when served from /uploads/*. This is a stored-XSS vector. If SVG support
// is required in the future, serve them with Content-Disposition: attachment
// + Content-Type: image/svg+xml AND sanitize the XML server-side (DOMPurify
// doesn't run server-side; use @mapbox/svg-transform or similar).
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.pdf'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf',
];

// GET /api/media — public, returns media for the resolved wedding
export const GET = withPublicTenant(async (request, _ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (category) where.category = category;
    // weddingId is auto-injected by the extension

    const media = await tenantDb.media.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ media });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List media error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

// POST /api/media — admin only, uploads a new media file
// P2-SEC-6: defined as a local function then wrapped on export so Next.js
// picks up the rate-limited version (30/min) while the handler body stays
// readable. File I/O + thumbnail generation is bandwidth-heavy.
// Casts withAdminTenantHandler's Promise<Response> to Promise<NextResponse>
// — runtime is NextResponse, but the lib's signature types it as Response.
async function uploadMediaHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    return await withAdminTenantHandler(request, user, async (_req, ctx) => {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const title = formData.get('title') as string | null;
      const description = formData.get('description') as string | null;
      const mediaType = (formData.get('type') as string) || 'PHOTO';
      const mediaCategory = (formData.get('category') as string) || 'GALLERY';
      const order = parseInt(formData.get('order') as string) || 0;

      if (!file) {
        return NextResponse.json(
          { error: 'Aucun fichier fourni', code: 'NO_FILE' },
          { status: 400 }
        );
      }
      // 5.8.17 FIX-P0-P1 (FIX 1): reject empty (0-byte) files. Previously a
      // 0-byte upload was silently accepted with sizeBytes=0 and stored as
      // type=PHOTO, corrupting the gallery and breaking <img> rendering.
      if (file.size === 0) {
        return NextResponse.json(
          { error: 'Le fichier est vide', code: 'EMPTY_FILE' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
      }
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json({ error: `File type "${ext}" is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 });
      }
      if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `MIME type "${file.type}" is not allowed` }, { status: 400 });
      }
      const validTypes = ['PHOTO', 'VIDEO', 'LOGO', 'DOCUMENT'];
      if (!validTypes.includes(mediaType)) {
        return NextResponse.json({ error: 'Invalid media type' }, { status: 400 });
      }
      const validCategories = ['GALLERY', 'COUPLE_STORY', 'DOCUMENT', 'OTHER'];
      if (!validCategories.includes(mediaCategory)) {
        return NextResponse.json({ error: 'Invalid media category' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // 5.8.17 FIX-P0-P1 (FIX 1): magic-byte validation. Previously a
      // truncated/garbage file with a .jpg extension was silently accepted
      // (HTTP 201), written to /uploads/, and stored as type=PHOTO with
      // sizeBytes=N — but the file would fail to decode in <img>, breaking
      // the gallery. This checks the first few bytes against the canonical
      // magic signatures for each allowed image + PDF type. Videos (mp4,
      // webm) have container-specific signatures that vary by encoder, so
      // we trust the extension + MIME check above for those (the player
      // surfaces decode errors gracefully).
      const MAGIC_BYTES: Record<string, Array<[number, number]>> = {
        '.jpg': [[0, 0xff], [1, 0xd8], [2, 0xff]],
        '.jpeg': [[0, 0xff], [1, 0xd8], [2, 0xff]],
        '.png': [[0, 0x89], [1, 0x50], [2, 0x4e], [3, 0x47], [4, 0x0d], [5, 0x0a], [6, 0x1a], [7, 0x0a]],
        '.gif': [[0, 0x47], [1, 0x49], [2, 0x46], [3, 0x38]],
        '.webp': [[0, 0x52], [1, 0x49], [2, 0x46], [3, 0x46], [8, 0x57], [9, 0x45], [10, 0x42], [11, 0x50]],
        '.pdf': [[0, 0x25], [1, 0x50], [2, 0x44], [3, 0x46]],
      };
      const expectedMagic = MAGIC_BYTES[ext];
      if (expectedMagic) {
        for (const [offset, byte] of expectedMagic) {
          if (buffer[offset] !== byte) {
            return NextResponse.json(
              {
                error: `Le fichier ne correspond pas à son extension "${ext}" (signature invalide). Le fichier est peut-être corrompu ou renommé.`,
                code: 'CORRUPTED_FILE',
              },
              { status: 400 }
            );
          }
        }
      }

      // ─── Plan limit enforcement (Phase 3 ÉTAPE 5) ─────────────────────────
      // Block NEW media uploads when the wedding has reached its plan's
      // storage quota. Existing media above the limit remains visible +
      // deletable (zero regression). The check uses the actual file size
      // (buffer.byteLength), not the multipart Content-Length header.
      try {
        const limitCheck = await checkMediaLimit(ctx.weddingId, buffer.byteLength);
        if (!limitCheck.allowed) {
          return NextResponse.json(
            {
              error: 'Limite de stockage média atteinte pour votre plan',
              limitBytes: limitCheck.limitBytes,
              currentBytes: limitCheck.currentBytes,
              requestedBytes: buffer.byteLength,
              plan: limitCheck.plan,
              upgradeUrl: '/platform/admin',
            },
            { status: 403 }
          );
        }
      } catch (limitError) {
        // If the limit check itself fails, log and continue — we don't want
        // to block a legitimate upload because of an internal accounting error.
        // P2-SEC-1: structured logger; no stack leak.
        logger.error('Media limit check failed', {
          errMessage: limitError instanceof Error ? limitError.message : String(limitError),
          errName: limitError instanceof Error ? limitError.name : 'Unknown',
        });
      }

      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      // MISSION-5.9.0 Phase 0.11: slug allow-list regex — defense-in-depth against path traversal.
      // ctx.slug comes from the resolved CachedWedding (not user input), but if a future code path
      // ever passes a user-controlled slug (e.g. "../../etc"), this regex blocks it.
      if (!/^[a-z0-9-]+$/.test(ctx.slug)) {
        return NextResponse.json({ error: 'Invalid wedding slug' }, { status: 400 });
      }
      // Per-wedding subdirectory to keep uploads organized (Phase 9 will move to R2)
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', ctx.slug);
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, uniqueName);
      await writeFile(filePath, buffer);

      const url = `/uploads/${ctx.slug}/${uniqueName}`;

      const media = await tenantDb.media.create({
        data: {
          weddingId: ctx.weddingId,
          type: mediaType,
          storageProvider: 'LOCAL',
          storageKey: `${ctx.slug}/${uniqueName}`,
          url,
          title: title || file.name,
          description: description || null,
          category: mediaCategory,
          order,
          sizeBytes: buffer.byteLength, // persisted for plan-limit enforcement (Phase 3 ÉTAPE 5)
          mime: file.type || null,
        },
      });

      // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'UPLOAD_MEDIA',
        details: `Uploaded media: ${title || file.name}`,
        request,
      });

      // P2.4: meter MEDIA_BYTES — sum of uploaded file sizes per wedding per
      // month. Best-effort; helper swallows internally, .catch is belt-and-
      // suspenders. We use the actual buffer size (not the multipart header)
      // for consistency with the plan-limit check above.
      await incrementUsage(ctx.weddingId, 'MEDIA_BYTES', buffer.byteLength).catch(() => {});

      return NextResponse.json({ media }, { status: 201 });
    }) as unknown as NextResponse;
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Upload media error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// P2-SEC-6: rate-limit the POST handler (30 requests / 60s per IP).
export const POST = withRateLimit(30, 60_000)(uploadMediaHandler);

// DELETE /api/media?id=... — admin only
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });

      const existing = await tenantDb.media.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Media not found' }, { status: 404 });

      // Try to delete the file from disk
      try {
        const filePath = path.join(process.cwd(), 'public', existing.url);
        await unlink(filePath);
      } catch {
        // File may not exist on disk, continue with DB deletion
      }

      await tenantDb.media.delete({ where: { id } });

      // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'DELETE_MEDIA',
        details: `Deleted media: ${existing.title || existing.url}`,
        request,
      });

      return NextResponse.json({ message: 'Media deleted successfully' });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete media error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
