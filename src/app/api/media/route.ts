import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (category) where.category = category;

    const media = await db.media.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ media });
  } catch (error) {
    console.error('List media error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const mediaType = (formData.get('type') as string) || 'PHOTO';
    const mediaCategory = (formData.get('category') as string) || 'GALLERY';
    const order = parseInt(formData.get('order') as string) || 0;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const validTypes = ['PHOTO', 'VIDEO', 'LOGO', 'DOCUMENT'];
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json(
        { error: 'Invalid media type' },
        { status: 400 }
      );
    }

    const validCategories = ['GALLERY', 'COUPLE_STORY', 'DOCUMENT', 'OTHER'];
    if (!validCategories.includes(mediaCategory)) {
      return NextResponse.json(
        { error: 'Invalid media category' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = path.extname(file.name) || '.jpg';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', uniqueName);

    await writeFile(filePath, buffer);

    const url = `/uploads/${uniqueName}`;

    const media = await db.media.create({
      data: {
        type: mediaType,
        url,
        title: title || file.name,
        description: description || null,
        category: mediaCategory,
        order,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPLOAD_MEDIA',
        details: `Uploaded media: ${title || file.name}`,
      },
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    console.error('Upload media error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.media.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    // Try to delete the file from disk
    try {
      const filePath = path.join(process.cwd(), 'public', existing.url);
      await unlink(filePath);
    } catch {
      // File may not exist on disk, continue with DB deletion
    }

    await db.media.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_MEDIA',
        details: `Deleted media: ${existing.title || existing.url}`,
      },
    });

    return NextResponse.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Delete media error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
