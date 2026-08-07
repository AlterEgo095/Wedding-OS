export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Mission 6.0 P1.6 — Suspend an organization.
 *
 * POST /api/platform/organizations/{id}/suspend
 *   → 200 { organization }
 *
 * Sets status=SUSPENDED. A suspended org cannot accept new members or create
 * new weddings, but existing weddings remain accessible to current members.
 * The downstream enforcement (block new invites / new weddings) is wired in
 * P1.7/P1.8 (UI) and the assertWeddingAccessAsync path (P1.4 already allows
 * read access; this is a soft suspend, not a hard lock).
 *
 * Platform-admin only. Idempotent — suspending an already-suspended org
 * returns 200 (no-op, no audit log written twice).
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit: 5 req/min — suspend is a sensitive operation.
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

    // ARCHIVED orgs cannot be suspended (they're already in a terminal state).
    if (existing.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: "Impossible de suspendre une organisation archivée" },
        { status: 409 }
      );
    }

    // Idempotent: already suspended → return current state without audit log.
    if (existing.status === 'SUSPENDED') {
      return NextResponse.json({ organization: existing });
    }

    const client = getClientInfo(request);

    const suspended = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data: { status: 'SUSPENDED' },
        select: { id: true, slug: true, name: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'SUSPEND_ORGANIZATION',
          details: `Suspended organization ${org.slug} (${org.name})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    return NextResponse.json({ organization: suspended });
  } catch (error) {
    logger.error('Suspend organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
