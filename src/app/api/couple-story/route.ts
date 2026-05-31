import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';

export async function GET() {
  try {
    const stories = await db.coupleStory.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ stories });
  } catch (error) {
    console.error('List couple story error:', error);
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

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, date, imageUrl, order } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const story = await db.coupleStory.create({
      data: {
        title,
        description,
        date: date || null,
        imageUrl: imageUrl || null,
        order: order || 0,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_COUPLE_STORY',
        details: `Created couple story: ${title}`,
      },
    });

    return NextResponse.json({ story }, { status: 201 });
  } catch (error) {
    console.error('Create couple story error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, title, description, date, imageUrl, order } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Story ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.coupleStory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (date !== undefined) updateData.date = date;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (order !== undefined) updateData.order = order;

    const story = await db.coupleStory.update({
      where: { id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_COUPLE_STORY',
        details: `Updated couple story: ${existing.title}`,
      },
    });

    return NextResponse.json({ story });
  } catch (error) {
    console.error('Update couple story error:', error);
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
        { error: 'Story ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.coupleStory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    await db.coupleStory.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_COUPLE_STORY',
        details: `Deleted couple story: ${existing.title}`,
      },
    });

    return NextResponse.json({ message: 'Couple story deleted successfully' });
  } catch (error) {
    console.error('Delete couple story error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
