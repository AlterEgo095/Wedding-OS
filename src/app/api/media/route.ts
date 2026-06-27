export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.pdf'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
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
    console.error('List media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/media — admin only, uploads a new media file
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const title = formData.get('title') as string | null;
      const description = formData.get('description') as string | null;
      const mediaType = (formData.get('type') as string) || 'PHOTO';
      const mediaCategory = (formData.get('category') as string) || 'GALLERY';
      const order = parseInt(formData.get('order') as string) || 0;

      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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

      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
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
        },
      });

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'UPLOAD_MEDIA',
          details: `Uploaded media: ${title || file.name}`,
        },
      });

      return NextResponse.json({ media }, { status: 201 });
    });
  } catch (error) {
    console.error('Upload media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'DELETE_MEDIA',
          details: `Deleted media: ${existing.title || existing.url}`,
        },
      });

      return NextResponse.json({ message: 'Media deleted successfully' });
    });
  } catch (error) {
    console.error('Delete media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
