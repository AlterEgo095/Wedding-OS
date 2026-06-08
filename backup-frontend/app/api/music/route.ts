export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB for audio files
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const ALLOWED_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
  'audio/ogg', 'audio/x-ogg', 'audio/m4a', 'audio/aac',
  'audio/x-m4a', 'audio/mp4', 'audio/x-wav',
];

// Default music settings
const DEFAULT_SETTINGS = {
  music_enabled: 'false',
  music_volume: '0.25',
  music_file: '',
  music_original_name: '',
};

/** Helper: get a music setting from DB */
async function getMusicSetting(key: string): Promise<string> {
  const setting = await db.settings.findUnique({ where: { key } });
  return setting?.value ?? DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] ?? '';
}

/** Helper: set a music setting in DB (upsert) */
async function setMusicSetting(key: string, value: string) {
  await db.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** GET — Retrieve music settings (public, no auth required) */
export async function GET() {
  try {
    const musicFile = await getMusicSetting('music_file');
    const settings = {
      music_enabled: await getMusicSetting('music_enabled'),
      music_volume: await getMusicSetting('music_volume'),
      music_file: musicFile,
      music_original_name: await getMusicSetting('music_original_name'),
    };
    // Add a playable URL via the API route (works at runtime even in standalone mode)
    // Next.js standalone server doesn't serve files added to public/ after build,
    // so we provide an API-based URL that reads and serves the file dynamically.
    const playableUrl = musicFile
      ? `/api/music/file?f=${encodeURIComponent(path.basename(musicFile))}`
      : '';
    return NextResponse.json({ music: settings, music_url: playableUrl });
  } catch (error) {
    console.error('Get music settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Upload a new audio file */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // File extension validation
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Format "${ext}" non supporté. Formats acceptés: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // MIME type validation (lenient: allow audio/*, application/octet-stream, or empty)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('audio/') && file.type !== 'application/octet-stream') {
      return NextResponse.json(
        { error: `Type MIME "${file.type}" non autorisé` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'music');
    await mkdir(uploadDir, { recursive: true });

    // Delete old music file if exists
    const oldFile = await getMusicSetting('music_file');
    if (oldFile) {
      try {
        const oldPath = path.join(process.cwd(), 'public', oldFile);
        await unlink(oldPath);
      } catch {
        // Old file may not exist, continue
      }
    }

    // Generate unique filename
    const uniqueName = `ambient-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

    const url = `/uploads/music/${uniqueName}`;

    // Save file info to settings
    await setMusicSetting('music_file', url);
    await setMusicSetting('music_original_name', file.name);

    // Enable music by default when a file is uploaded
    await setMusicSetting('music_enabled', 'true');

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPLOAD_MUSIC',
        details: `Musique d'ambiance uploadée: ${file.name}`,
      },
    });

    // Return updated settings with playable URL
    const settings = {
      music_enabled: await getMusicSetting('music_enabled'),
      music_volume: await getMusicSetting('music_volume'),
      music_file: url,
      music_original_name: file.name,
    };

    const playableUrl = `/api/music/file?f=${encodeURIComponent(uniqueName)}`;
    return NextResponse.json({ music: settings, music_url: playableUrl }, { status: 201 });
  } catch (error) {
    console.error('Upload music error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** PUT — Update music settings (enable/disable, volume) */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, volume } = body as {
      enabled?: boolean;
      volume?: number;
    };

    if (enabled !== undefined) {
      await setMusicSetting('music_enabled', enabled ? 'true' : 'false');
    }

    if (volume !== undefined) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      await setMusicSetting('music_volume', v.toFixed(2));
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_MUSIC_SETTINGS',
        details: `Paramètres musique: enabled=${enabled ?? 'unchanged'}, volume=${volume ?? 'unchanged'}`,
      },
    });

    // Return updated settings with playable URL
    const musicFile = await getMusicSetting('music_file');
    const settings = {
      music_enabled: await getMusicSetting('music_enabled'),
      music_volume: await getMusicSetting('music_volume'),
      music_file: musicFile,
      music_original_name: await getMusicSetting('music_original_name'),
    };

    const playableUrl = musicFile
      ? `/api/music/file?f=${encodeURIComponent(path.basename(musicFile))}`
      : '';
    return NextResponse.json({ music: settings, music_url: playableUrl });
  } catch (error) {
    console.error('Update music settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** DELETE — Remove current music file */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentFile = await getMusicSetting('music_file');
    if (currentFile) {
      try {
        const filePath = path.join(process.cwd(), 'public', currentFile);
        await unlink(filePath);
      } catch {
        // File may not exist, continue
      }
    }

    // Reset all music settings
    await setMusicSetting('music_file', '');
    await setMusicSetting('music_original_name', '');
    await setMusicSetting('music_enabled', 'false');

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_MUSIC',
        details: 'Musique d\'ambiance supprimée',
      },
    });

    return NextResponse.json({
      music: {
        music_enabled: 'false',
        music_volume: await getMusicSetting('music_volume'),
        music_file: '',
        music_original_name: '',
      },
    });
  } catch (error) {
    console.error('Delete music error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
