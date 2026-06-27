export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler, TenantContext } from '@/lib/tenant-context';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB for audio files
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const ALLOWED_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
  'audio/ogg', 'audio/x-ogg', 'audio/m4a', 'audio/aac',
  'audio/x-m4a', 'audio/mp4', 'audio/x-wav',
];

const DEFAULT_SETTINGS = {
  music_enabled: 'false',
  music_volume: '0.25',
  music_file: '',
  music_original_name: '',
};

/** Helper: get a music setting for the current tenant (uses composite unique key) */
async function getMusicSetting(ctx: TenantContext, key: string): Promise<string> {
  const setting = await tenantDb.settings.findUnique({
    where: { weddingId_key: { weddingId: ctx.weddingId, key } },
  });
  return setting?.value ?? DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] ?? '';
}

/** Helper: set a music setting for the current tenant (uses composite unique key) */
async function setMusicSetting(ctx: TenantContext, key: string, value: string) {
  await tenantDb.settings.upsert({
    where: { weddingId_key: { weddingId: ctx.weddingId, key } },
    update: { value },
    create: { weddingId: ctx.weddingId, key, value },
  });
}

/** GET — Retrieve music settings (public, no auth required) */
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const musicFile = await getMusicSetting(ctx, 'music_file');
    const settings = {
      music_enabled: await getMusicSetting(ctx, 'music_enabled'),
      music_volume: await getMusicSetting(ctx, 'music_volume'),
      music_file: musicFile,
      music_original_name: await getMusicSetting(ctx, 'music_original_name'),
    };
    const playableUrl = musicFile
      ? `/api/music/file?f=${encodeURIComponent(path.basename(musicFile))}`
      : '';
    return NextResponse.json({ music: settings, music_url: playableUrl });
  } catch (error) {
    console.error('Get music settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/** POST — Upload a new audio file */
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

      if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `Fichier trop volumineux. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
      }

      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json({ error: `Format "${ext}" non supporté. Formats acceptés: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 });
      }

      if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('audio/') && file.type !== 'application/octet-stream') {
        return NextResponse.json({ error: `Type MIME "${file.type}" non autorisé` }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Per-wedding upload directory
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', ctx.slug, 'music');
      await mkdir(uploadDir, { recursive: true });

      // Delete old music file if exists
      const oldFile = await getMusicSetting(ctx, 'music_file');
      if (oldFile) {
        try {
          const oldPath = path.join(process.cwd(), 'public', oldFile);
          await unlink(oldPath);
        } catch { /* Old file may not exist, continue */ }
      }

      const uniqueName = `ambient-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      const filePath = path.join(uploadDir, uniqueName);
      await writeFile(filePath, buffer);

      const url = `/uploads/${ctx.slug}/music/${uniqueName}`;

      await setMusicSetting(ctx, 'music_file', url);
      await setMusicSetting(ctx, 'music_original_name', file.name);
      await setMusicSetting(ctx, 'music_enabled', 'true');

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'UPLOAD_MUSIC',
          details: `Musique d'ambiance uploadée: ${file.name}`,
        },
      });

      const settings = {
        music_enabled: 'true',
        music_volume: await getMusicSetting(ctx, 'music_volume'),
        music_file: url,
        music_original_name: file.name,
      };
      const playableUrl = `/api/music/file?f=${encodeURIComponent(uniqueName)}`;
      return NextResponse.json({ music: settings, music_url: playableUrl }, { status: 201 });
    });
  } catch (error) {
    console.error('Upload music error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT — Update music settings (enable/disable, volume) */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json();
      const { enabled, volume } = body as { enabled?: boolean; volume?: number };

      if (enabled !== undefined) {
        await setMusicSetting(ctx, 'music_enabled', enabled ? 'true' : 'false');
      }
      if (volume !== undefined) {
        const v = Math.max(0, Math.min(1, Number(volume)));
        await setMusicSetting(ctx, 'music_volume', v.toFixed(2));
      }

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'UPDATE_MUSIC_SETTINGS',
          details: `Paramètres musique: enabled=${enabled ?? 'unchanged'}, volume=${volume ?? 'unchanged'}`,
        },
      });

      const musicFile = await getMusicSetting(ctx, 'music_file');
      const settings = {
        music_enabled: await getMusicSetting(ctx, 'music_enabled'),
        music_volume: await getMusicSetting(ctx, 'music_volume'),
        music_file: musicFile,
        music_original_name: await getMusicSetting(ctx, 'music_original_name'),
      };

      const playableUrl = musicFile
        ? `/api/music/file?f=${encodeURIComponent(path.basename(musicFile))}`
        : '';
      return NextResponse.json({ music: settings, music_url: playableUrl });
    });
  } catch (error) {
    console.error('Update music settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE — Remove current music file */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const currentFile = await getMusicSetting(ctx, 'music_file');
      if (currentFile) {
        try {
          const filePath = path.join(process.cwd(), 'public', currentFile);
          await unlink(filePath);
        } catch { /* File may not exist */ }
      }

      await setMusicSetting(ctx, 'music_file', '');
      await setMusicSetting(ctx, 'music_original_name', '');
      await setMusicSetting(ctx, 'music_enabled', 'false');

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'DELETE_MUSIC',
          details: 'Musique d\'ambiance supprimée',
        },
      });

      return NextResponse.json({
        music: {
          music_enabled: 'false',
          music_volume: await getMusicSetting(ctx, 'music_volume'),
          music_file: '',
          music_original_name: '',
        },
      });
    });
  } catch (error) {
    console.error('Delete music error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
