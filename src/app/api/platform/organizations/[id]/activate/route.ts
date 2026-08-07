export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Mission 6.0 P1.6 — (Re)activate an organization.
 *
 * POST /api/platform/organizations/{id}/activate
 *   → 200 { organization }
 *
 * Sets status=ACTIVE. Idempotent — activating an already-active org returns
 * 200 without writing a second audit log entry.
 *
 * ARCHIVED orgs cannot be re-activated via this endpoint (un-archive is a
 * separate, more dangerous operation that should go through DELETE-undo flow,
 * not yet implemented). Return 409.
 *
 * Platform-admin only.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } }
      );
    }

    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return badRequest("Identifiant d'organisation requis");

    const existing = await db.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!existing) return notFound("Organisation introuvable");

    if (existing.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: "Impossible de réactiver une organisation archivée" },
        { status: 409 }
      );
    }

    // Idempotent: already active → return current state without audit log.
    if (existing.status === 'ACTIVE') {
      return NextResponse.json({ organization: existing });
    }

    const client = getClientInfo(request);

    const activated = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data: { status: 'ACTIVE' },
        select: { id: true, slug: true, name: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ACTIVATE_ORGANIZATION',
          details: `Activated organization ${org.slug} (${org.name})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    return NextResponse.json({ organization: activated });
  } catch (error) {
    logger.error('Activate organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
