import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';

export async function GET() {
  try {
    const events = await db.eventTimeline.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('List timeline error:', error);
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
    const { time, activity, location, description, order } = body;

    if (!time || !activity) {
      return NextResponse.json(
        { error: 'Time and activity are required' },
        { status: 400 }
      );
    }

    const event = await db.eventTimeline.create({
      data: {
        time,
        activity,
        location: location || null,
        description: description || null,
        order: order || 0,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_TIMELINE',
        details: `Created timeline event: ${activity}`,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Create timeline error:', error);
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
    const { id, time, activity, location, description, order } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.eventTimeline.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (time !== undefined) updateData.time = time;
    if (activity !== undefined) updateData.activity = activity;
    if (location !== undefined) updateData.location = location;
    if (description !== undefined) updateData.description = description;
    if (order !== undefined) updateData.order = order;

    const event = await db.eventTimeline.update({
      where: { id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_TIMELINE',
        details: `Updated timeline event: ${existing.activity}`,
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Update timeline error:', error);
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
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.eventTimeline.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await db.eventTimeline.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_TIMELINE',
        details: `Deleted timeline event: ${existing.activity}`,
      },
    });

    return NextResponse.json({ message: 'Timeline event deleted successfully' });
  } catch (error) {
    console.error('Delete timeline error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
