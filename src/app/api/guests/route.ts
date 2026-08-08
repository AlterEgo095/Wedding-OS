export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { checkGuestLimit } from '@/lib/plan-limits';
// P2-SEC-14 + P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// CONS-7 task 5: Zod request-body validation.
import { z } from 'zod';
// P2.4: usage metering (GUESTS counter increment after successful create).
import { incrementUsage } from '@/lib/usage';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const { searchParams } = new URL(request.url);

      // P2-PERF-14: cursor pagination support.
      //   • ?cursor=<createdAtIso>&limit=N  → cursor mode (preferred, no COUNT)
      //   • ?page=N&limit=N                 → offset mode (backwards-compat)
      //   • ?limit=N (neither)              → cursor mode, first page
      // The `limit` is clamped to [1, 100] in all modes to prevent abuse.
      // Filters (status, category, tableId, search) are preserved across both
      // modes and combined with the cursor predicate via Prisma's implicit AND.
      const cursor = searchParams.get('cursor');
      const limit = Math.min(
        Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
        100,
      );
      const status = searchParams.get('status');
      const category = searchParams.get('category');
      const tableId = searchParams.get('tableId');
      const search = searchParams.get('search');

      // Shared where clause (used by both cursor + offset modes).
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
      // weddingId auto-injected by extension

      const include = { table: { select: { id: true, name: true, number: true } } };

      // ─── Cursor mode ─────────────────────────────────────────────────────
      // We fetch `limit + 1` rows to detect `hasMore` without a COUNT query
      // (COUNT(*) on SQLite with WHERE can be slow on large guest lists).
      // The cursor is the `createdAt` ISO string of the last row of the
      // previous page — combined with `orderBy: createdAt desc` this gives a
      // stable, index-friendly seek.
      if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid cursor (expected ISO 8601 date)' },
            { status: 400 },
          );
        }
        const guests = await tenantDb.guest.findMany({
          where: { ...where, createdAt: { lt: cursorDate } },
          include,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
        });
        const hasMore = guests.length > limit;
        const trimmed = hasMore ? guests.slice(0, limit) : guests;
        const nextCursor =
          hasMore && trimmed.length > 0
            ? trimmed[trimmed.length - 1].createdAt.toISOString()
            : null;
        return NextResponse.json({ guests: trimmed, nextCursor, hasMore });
      }

      // ─── Offset mode (backwards-compat) ──────────────────────────────────
      // Existing clients call ?page=N&limit=N and expect
      //   { guests, pagination: { page, limit, total, totalPages } }.
      // We preserve that contract by default. Pass `includeTotal=false` to
      // skip the COUNT(*) query when the client doesn't need totals (e.g.
      // infinite-scroll UIs that already use the cursor mode above).
      if (searchParams.has('page')) {
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
        const skip = (page - 1) * limit;
        const includeTotal = searchParams.get('includeTotal') !== 'false';
        const [guests, total] = await Promise.all([
          tenantDb.guest.findMany({
            where,
            include,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          includeTotal ? tenantDb.guest.count({ where }) : Promise.resolve(undefined),
        ]);
        return NextResponse.json({
          guests,
          pagination: {
            page,
            limit,
            total,
            totalPages: typeof total === 'number' ? Math.ceil(total / limit) : undefined,
          },
        });
      }

      // ─── Default: cursor mode, first page ────────────────────────────────
      const guests = await tenantDb.guest.findMany({
        where,
        include,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      });
      const hasMore = guests.length > limit;
      const trimmed = hasMore ? guests.slice(0, limit) : guests;
      const nextCursor =
        hasMore && trimmed.length > 0
          ? trimmed[trimmed.length - 1].createdAt.toISOString()
          : null;
      return NextResponse.json({ guests: trimmed, nextCursor, hasMore });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List guests error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// CONS-7 task 5 — Zod schema for guest creation.
const createGuestSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  displayName: z.string().max(200).optional(),
  invitationType: z.enum(['individuel', 'couple', 'famille']).optional(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  tableId: z.string().optional().nullable(),
  seats: z.number().int().min(1).max(20).optional(),
  category: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
  personalMessage: z.string().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest) {
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
      const body = await request.json().catch(() => null);
      if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
      // CONS-7 task 5: Zod validation replaces ad-hoc field checks.
      const parsed = createGuestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: 'Données invalides',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          { status: 400 },
        );
      }
      const { firstName, lastName, displayName: explicitDisplayName, invitationType, phone, email, tableId, seats, category, status, personalMessage } = parsed.data;

      // ─── Plan limit enforcement (Phase 3 ÉTAPE 5) ─────────────────────────
      // Block NEW guest creation when the wedding has reached its plan quota.
      // Existing guests above the limit remain visible + editable (zero regression).
      try {
        const limitCheck = await checkGuestLimit(context.weddingId);
        if (!limitCheck.allowed) {
          return NextResponse.json(
            {
              error: "Limite d'invités atteinte pour votre plan",
              limit: limitCheck.limit,
              current: limitCheck.current,
              plan: limitCheck.plan,
              upgradeUrl: '/platform/admin',
            },
            { status: 403 }
          );
        }
      } catch (limitError) {
        // If the limit check itself fails (e.g. wedding not found), log and
        // continue — we don't want to block a legitimate write because of an
        // internal accounting error. The tenant context already validated
        // the weddingId above.
        logger.error('Guest limit check failed', { err: limitError });
      }

      const invitationCode = uuidv4().substring(0, 8).toUpperCase();
      const invType = invitationType || 'individuel';
      const displayName = explicitDisplayName || (
        invType === 'couple' ? `Couple ${lastName}` : `${firstName} ${lastName}`
      );

      const guest = await tenantDb.guest.create({
        data: {
          weddingId: context.weddingId, // explicit for clarity
          firstName, lastName, displayName,
          invitationType: invType,
          phone: phone || null, email: email || null,
          tableId: tableId || null,
          seats: seats || 1, category: category || 'AMIS',
          status: status || 'PENDING',
          personalMessage: personalMessage || null,
          invitationCode,
        },
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      await writeAuditLog({
        weddingId: context.weddingId, userId: user.id,
        action: 'CREATE_GUEST',
        details: `Created guest ${firstName} ${lastName}`,
        request,
      });

      // P2.4: meter GUESTS — best-effort, never breaks the primary op.
      // Helper swallows internally; .catch is belt-and-suspenders.
      await incrementUsage(context.weddingId, 'GUESTS', 1).catch(() => {});

      return NextResponse.json({ guest }, { status: 201 });
    });
  } catch (error) {
    logger.error('Create guest error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function PUT(request: NextRequest) {
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
      const body = await request.json();
      const { id, firstName, lastName, displayName, invitationType, phone, email, tableId, seats, category, status, personalMessage, checkedIn } = body;

      if (!id) return NextResponse.json({ error: 'Guest ID is required' }, { status: 400 });

      // findFirst — auto-scoped by extension
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

      await writeAuditLog({
        weddingId: context.weddingId, userId: user.id,
        action: 'UPDATE_GUEST',
        details: `Updated guest ${existing.firstName} ${existing.lastName}`,
        request,
      });

      return NextResponse.json({ guest });
    });
  } catch (error) {
    logger.error('Update guest error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function DELETE(request: NextRequest) {
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
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Guest ID is required' }, { status: 400 });

      const existing = await tenantDb.guest.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });

      await tenantDb.guest.delete({ where: { id } });

      await writeAuditLog({
        weddingId: context.weddingId, userId: user.id,
        action: 'DELETE_GUEST',
        details: `Deleted guest ${existing.firstName} ${existing.lastName}`,
        request,
      });

      return NextResponse.json({ message: 'Guest deleted successfully' });
    });
  } catch (error) {
    logger.error('Delete guest error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
