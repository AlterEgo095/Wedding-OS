export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const guest = await db.guest.findUnique({
      where: { id },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
            capacity: true,
          },
        },
      },
    });

    if (!guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    return NextResponse.json({ guest });
  } catch (error) {
    console.error('Get guest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, phone, email, tableId, seats, category, status, personalMessage, checkedIn } = body;

    const existing = await db.guest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (tableId !== undefined) updateData.tableId = tableId || null;
    if (seats !== undefined) updateData.seats = seats;
    if (category !== undefined) updateData.category = category;
    if (status !== undefined) updateData.status = status;
    if (personalMessage !== undefined) updateData.personalMessage = personalMessage;
    if (checkedIn !== undefined) {
      updateData.checkedIn = checkedIn;
      updateData.checkedInAt = checkedIn ? new Date() : null;
    }

    const guest = await db.guest.update({
      where: { id },
      data: updateData,
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_GUEST',
        details: `Updated guest ${existing.firstName} ${existing.lastName}`,
      },
    });

    return NextResponse.json({ guest });
  } catch (error) {
    console.error('Update guest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.guest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    await db.guest.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_GUEST',
        details: `Deleted guest ${existing.firstName} ${existing.lastName}`,
      },
    });

    return NextResponse.json({ message: 'Guest deleted successfully' });
  } catch (error) {
    console.error('Delete guest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
