export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'music');

/**
 * GET — Serve an uploaded music file by filename
 * This route exists because Next.js standalone server doesn't dynamically
 * serve files added to public/ after build time. Files uploaded at runtime
 * need this API route to be accessible.
 *
 * Usage: /api/music/file?f=ambient-1234567890-abc.mp3
 */
export async function GET(request: NextRequest) {
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

    // Verify the file exists in the music settings
    const musicFileSetting = await db.settings.findUnique({ where: { key: 'music_file' } });
    const storedPath = musicFileSetting?.value || '';

    // The stored path is like /uploads/music/ambient-xxx.mp3
    // We need to verify the requested file matches
    const expectedBasename = path.basename(storedPath);
    if (basename !== expectedBasename) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const filePath = path.join(UPLOAD_DIR, basename);

    // Check file exists
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
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
}
