export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withPublicTenant } from '@/lib/tenant-context';
import { readFile, stat } from 'fs/promises';
import path from 'path';

/**
 * GET — Serve an uploaded music file by filename.
 *
 * Tenant-aware since Phase 3 ÉTAPE 4: the `music_file` setting is read with
 * the composite unique key `[weddingId, key]` for the resolved wedding, and
 * the file is served from the per-wedding upload directory
 * (`public/uploads/{slug}/music/`). If the file is not found there, the route
 * falls back to the legacy shared directory (`public/uploads/music/`) for
 * backward compatibility with files uploaded before the per-wedding
 * migration.
 *
 * Usage: /api/music/file?f=ambient-1234567890-abc.mp3
 */
export const GET = withPublicTenant(async (request, ctx) => {
  try {
    const filename = request.nextUrl.searchParams.get('f');

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
    }

    // Security: Only allow filenames without path traversal
    const basename = path.basename(filename);
    if (basename !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    // Verify the file exists in the music settings for THIS tenant (composite key)
    // Since Phase 1, Settings uses composite unique key [weddingId, key] — the
    // `key` field is no longer globally unique, so we MUST scope by weddingId.
    const musicFileSetting = await db.settings.findUnique({
      where: { weddingId_key: { weddingId: ctx.weddingId, key: 'music_file' } },
    });
    const storedPath = musicFileSetting?.value || '';

    // The stored path is like /uploads/{slug}/music/ambient-xxx.mp3
    // We need to verify the requested file matches the stored basename
    const expectedBasename = path.basename(storedPath);
    if (basename !== expectedBasename) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Build the tenant-aware file path: public/uploads/{slug}/music/{basename}
    const tenantSlug = ctx.slug || 'default';
    const tenantPath = path.join(process.cwd(), 'public', 'uploads', tenantSlug, 'music', basename);

    // Legacy shared path: public/uploads/music/{basename} (pre-per-wedding uploads)
    const legacyPath = path.join(process.cwd(), 'public', 'uploads', 'music', basename);

    // Try tenant path first; fall back to legacy path for backward compatibility
    let filePath: string;
    let fileStat;
    try {
      fileStat = await stat(tenantPath);
      filePath = tenantPath;
    } catch {
      // Tenant path doesn't exist — try legacy
      try {
        fileStat = await stat(legacyPath);
        filePath = legacyPath;
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    }

    // Determine content type
    const ext = path.extname(basename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Read and serve the file
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'public, max-age=604800',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('Serve music file error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
