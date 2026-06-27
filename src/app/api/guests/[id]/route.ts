export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { validateGuestSession, logGuestAccess, getClientInfo } from '@/lib/guest-auth';
import { resolveAdminTenant, resolvePublicTenant, runWithTenant } from '@/lib/tenant-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientInfo = getClientInfo(request);

    // Check admin auth first
    const adminUser = await getAuthUser(request);
    if (adminUser && hasPermission(adminUser.role, ['CONTROLLER'])) {
      const { context, error: tenantError } = await resolveAdminTenant(request, adminUser);
      if (tenantError || !context) {
        return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
      }
      return runWithTenant(context, async () => {
        const guest = await tenantDb.guest.findFirst({
          where: { id },
          include: { table: { select: { id: true, name: true, number: true, capacity: true } } },
        });
        if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
        return NextResponse.json({ guest });
      });
    }

    // Guest session auth — guest can only access their own data
    const guestToken = request.cookies.get('guest_session')?.value;
    if (guestToken) {
      // Use public tenant resolution (guest is not an admin)
      const { context, error: tenantError } = await resolvePublicTenant(request);
      if (tenantError || !context) {
        return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
      }

      return runWithTenant(context, async () => {
        const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
        if (session.valid && session.guestId) {
          if (session.guestId !== id) {
            await logGuestAccess({
              guestId: session.guestId, action: 'ACCESS_DENIED',
              details: `Guest attempted to access another guest's data (target: ${id.substring(0, 8)}***)`,
              ...clientInfo,
            });
            return NextResponse.json(
              { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' },
              { status: 403 }
            );
          }

          const guest = await tenantDb.guest.findFirst({
            where: { id },
            include: { table: { select: { id: true, name: true, number: true, capacity: true } } },
          });
          if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
          return NextResponse.json({ guest });
        }
        return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
      });
    }

    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  } catch (error) {
    console.error('Get guest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const { id } = await params;
      const body = await request.json();
      const { firstName, lastName, displayName, invitationType, phone, email, tableId, seats, category, status, personalMessage, checkedIn } = body;

      const existing = await tenantDb.guest.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });

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
        if (newInvType === 'couple') {
          updateData.displayName = `Couple ${newLast}`;
        } else if (newFirst && newLast) {
          updateData.displayName = `${newFirst} ${newLast}`;
        } else {
          updateData.displayName = newFirst || newLast || existing.displayName;
        }
      }

      const guest = await tenantDb.guest.update({
        where: { id }, data: updateData,
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      await db.auditLog.create({
        data: {
          weddingId: context.weddingId, userId: user.id,
          action: 'UPDATE_GUEST',
          details: `Updated guest ${existing.firstName} ${existing.lastName}`,
        },
      });

      return NextResponse.json({ guest });
    });
  } catch (error) {
    console.error('Update guest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const { id } = await params;
      const existing = await tenantDb.guest.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });

      await tenantDb.guest.delete({ where: { id } });

      await db.auditLog.create({
        data: {
          weddingId: context.weddingId, userId: user.id,
          action: 'DELETE_GUEST',
          details: `Deleted guest ${existing.firstName} ${existing.lastName}`,
        },
      });

      return NextResponse.json({ message: 'Guest deleted successfully' });
    });
  } catch (error) {
    console.error('Delete guest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
