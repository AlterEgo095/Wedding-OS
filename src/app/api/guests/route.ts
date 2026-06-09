export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const tableId = searchParams.get('tableId');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (tableId) where.tableId = tableId;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { invitationCode: { contains: search } },
      ];
    }

    const [guests, total] = await Promise.all([
      db.guest.findMany({
        where,
        include: {
          table: {
            select: {
              id: true,
              name: true,
              number: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.guest.count({ where }),
    ]);

    return NextResponse.json({
      guests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List guests error:', error);
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
    const {
      firstName,
      lastName,
      displayName: explicitDisplayName,
      invitationType,
      phone,
      email,
      tableId,
      seats,
      category,
      status,
      personalMessage,
    } = body;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'First name and last name are required' },
        { status: 400 }
      );
    }

    const invitationCode = uuidv4().substring(0, 8).toUpperCase();

    // Auto-generate displayName if not explicitly provided
    const invType = invitationType || 'individuel';
    const displayName = explicitDisplayName || (
      invType === 'couple' ? `Couple ${lastName}` : `${firstName} ${lastName}`
    );

    const guest = await db.guest.create({
      data: {
        firstName,
        lastName,
        displayName,
        invitationType: invType,
        phone: phone || null,
        email: email || null,
        tableId: tableId || null,
        seats: seats || 1,
        category: category || 'AMIS',
        status: status || 'PENDING',
        personalMessage: personalMessage || null,
        invitationCode,
      },
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
        action: 'CREATE_GUEST',
        details: `Created guest ${firstName} ${lastName}`,
      },
    });

    return NextResponse.json({ guest }, { status: 201 });
  } catch (error) {
    console.error('Create guest error:', error);
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
    const { id, firstName, lastName, displayName, invitationType, phone, email, tableId, seats, category, status, personalMessage, checkedIn } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Guest ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.guest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (invitationType !== undefined) updateData.invitationType = invitationType;
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

    // Auto-sync displayName when firstName/lastName change and no explicit displayName provided
    if ((firstName !== undefined || lastName !== undefined) && displayName === undefined) {
      const newFirst = (updateData.firstName as string) ?? existing.firstName;
      const newLast = (updateData.lastName as string) ?? existing.lastName;
      const newInvType = (updateData.invitationType as string) ?? existing.invitationType;
      // Regenerate displayName based on invitation type
      if (newInvType === 'couple') {
        updateData.displayName = `Couple ${newLast}`;
      } else if (newFirst && newLast) {
        updateData.displayName = `${newFirst} ${newLast}`;
      } else {
        updateData.displayName = newFirst || newLast || existing.displayName;
      }
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
        { error: 'Guest ID is required' },
        { status: 400 }
      );
    }

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
