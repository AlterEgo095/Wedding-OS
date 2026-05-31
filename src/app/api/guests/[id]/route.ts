export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { validateGuestSession, logGuestAccess, getClientInfo } from '@/lib/guest-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientInfo = getClientInfo(request);

    // ═══════════════════════════════════════════════════════════
    // SECURITY: This endpoint requires authentication
    // Option 1: Admin user (can access any guest)
    // Option 2: Authenticated guest (can ONLY access their own data)
    // ═══════════════════════════════════════════════════════════

    // Check admin auth first
    const adminUser = await getAuthUser(request);
    if (adminUser && hasPermission(adminUser.role, ['ORGANIZER'])) {
      // Admin can access any guest
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
    }

    // Check guest session auth
    const guestToken = request.cookies.get('guest_session')?.value;
    if (guestToken) {
      const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);

      if (session.valid && session.guestId) {
        // Guest can ONLY access their own data
        if (session.guestId !== id) {
          // Log unauthorized access attempt
          await logGuestAccess({
            guestId: session.guestId,
            action: 'ACCESS_DENIED',
            details: `Guest attempted to access another guest's data (target: ${id.substring(0, 8)}***)`,
            userAgent: clientInfo.userAgent,
            ipAddress: clientInfo.ipAddress,
          });

          return NextResponse.json(
            { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' },
            { status: 403 }
          );
        }

        // Return own guest data
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
      }
    }

    // No valid authentication
    return NextResponse.json(
      { error: 'Authentification requise' },
      { status: 401 }
    );
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
