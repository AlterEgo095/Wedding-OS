export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * POST /api/platform/themes/[id]/transition
 *
 * Drive the theme approval workflow (MISSION 5.9.2 P3-A — Task 4):
 *
 *     DRAFT ──submit──▶ REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED ──lock──▶ LOCKED
 *                        │                      │                     │           ▲
 *                        └──reject──▶ DRAFT       └──send back──▶ REVIEW │           │
 *                                                                              └──unlock──┘
 *
 * Allowed transitions (enforced server-side — clients that try to skip a step
 * get HTTP 422 with an actionable error message):
 *
 *   from         → to          side effects
 *   ────────────   ──────────   ────────────────────────────────────────────────────
 *   DRAFT        → REVIEW       (submit for review)
 *   REVIEW       → APPROVED     sets approvedAt = now(), approvedBy = user.id
 *   REVIEW       → DRAFT        (reject back to draft)
 *   APPROVED     → PUBLISHED    (publish)
 *   APPROVED     → REVIEW       (send back to review)
 *   PUBLISHED    → LOCKED       sets isLocked=true, lockedAt=now(), lockedBy=user.id
 *   LOCKED       → PUBLISHED    sets isLocked=false, lockedAt=null, lockedBy=null
 *
 * Invalid transitions (e.g. DRAFT → LOCKED directly) → 422.
 * Transitioning to the SAME state (e.g. APPROVED → APPROVED) is a no-op that
 * returns 200 with the unchanged theme (no audit log — idempotent re-call).
 *
 * Body:
 *   { to: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'LOCKED', notes?: string }
 *
 * Auth: PLATFORM_ADMIN only.
 * CSRF: X-CSRF-Token header.
 */

const THEME_SELECT = {
  id: true,
  name: true,
  slug: true,
  paletteJson: true,
  fontDisplay: true,
  fontBody: true,
  isBuiltIn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  tier: true,
  category: true,
  version: true,
  identity: true,
  configJson: true,
  // P3-A — lock + audit fields
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
} as const;

type ApprovalState = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'LOCKED';

const VALID_STATES: readonly ApprovalState[] = [
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'PUBLISHED',
  'LOCKED',
] as const;

/**
 * Allowed transitions. The keys are the `from` state, the values are the
 * set of valid `to` states from that state. Defined as a constant Map outside
 * the request handler so it's allocated once per process.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ApprovalState, readonly ApprovalState[]>> = {
  DRAFT: ['REVIEW'],
  REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'REVIEW'],
  PUBLISHED: ['LOCKED'],
  LOCKED: ['PUBLISHED'],
};

const transitionBodySchema = z.object({
  to: z.enum(VALID_STATES as unknown as [ApprovalState, ...ApprovalState[]]),
  notes: z.string().max(500).optional(),
});

/**
 * Human-readable French labels for the audit log + error messages.
 */
const STATE_LABEL: Record<ApprovalState, string> = {
  DRAFT: 'Brouillon',
  REVIEW: 'En revue',
  APPROVED: 'Approuvé',
  PUBLISHED: 'Publié',
  LOCKED: 'Verrouillé',
};

/**
 * Returns the list of valid `to` states reachable from `from`, joined as a
 * French-readable comma-separated list (used in the 422 error message so the
 * admin sees what transitions ARE allowed).
 */
function allowedTransitionsList(from: ApprovalState): string {
  return ALLOWED_TRANSITIONS[from]
    .map((s) => `${STATE_LABEL[s]} (${s})`)
    .join(', ');
}

async function transitionHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = transitionBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const { to, notes } = parsed.data;
    const notesTrim = notes?.trim() || '';

    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        isLocked: true,
        approvalStatus: true,
        approvedAt: true,
        approvedBy: true,
        lockedAt: true,
        lockedBy: true,
      },
    });
    if (!existing) return notFound('Thème introuvable');

    // Coerce the stored approvalStatus into our union type. If the column
    // somehow holds an unknown value (e.g. seeded data with a typo), treat it
    // as DRAFT so the admin can recover by transitioning DRAFT → REVIEW.
    const from = (
      VALID_STATES.includes(existing.approvalStatus as ApprovalState)
        ? (existing.approvalStatus as ApprovalState)
        : 'DRAFT'
    );

    // Idempotent: same-state transition is a no-op success.
    if (from === to) {
      // Fetch the full theme to return the consistent payload shape.
      const theme = await db.platformTheme.findUnique({
        where: { id },
        select: THEME_SELECT,
      });
      return NextResponse.json({ theme, from, to });
    }

    // Validate the transition is allowed.
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      return NextResponse.json(
        {
          error:
            `Transition invalide: ${STATE_LABEL[from]} → ${STATE_LABEL[to]}. ` +
            `Transitions autorisées depuis ${STATE_LABEL[from]}: ${allowedTransitionsList(from)}.`,
        },
        { status: 422 },
      );
    }

    // Build the update payload — set approvalStatus plus the side effects
    // specific to certain transitions.
    const updateData: {
      approvalStatus: ApprovalState;
      approvedAt?: Date;
      approvedBy?: string;
      isLocked?: boolean;
      lockedAt?: Date | null;
      lockedBy?: string | null;
    } = {
      approvalStatus: to,
    };

    if (to === 'APPROVED') {
      // Approve: stamp the audit fields. We always overwrite (a re-approval
      // after REVIEW → DRAFT → REVIEW → APPROVED should refresh the timestamp).
      updateData.approvedAt = new Date();
      updateData.approvedBy = user!.id;
    }

    if (to === 'LOCKED') {
      // PUBLISHED → LOCKED: engage the commercial lock (mirrors the
      // /api/platform/themes/[id]/lock endpoint logic, so the LOCKED state
      // and the isLocked flag stay consistent regardless of which path the
      // admin used).
      updateData.isLocked = true;
      updateData.lockedAt = new Date();
      updateData.lockedBy = user!.id;
    }

    if (from === 'LOCKED' && to === 'PUBLISHED') {
      // LOCKED → PUBLISHED: release the commercial lock (mirrors the /unlock
      // endpoint). approvalStatus was already set to `to` above.
      updateData.isLocked = false;
      updateData.lockedAt = null;
      updateData.lockedBy = null;
    }

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data: updateData,
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'THEME_TRANSITION',
          details:
            `Theme ${existing.slug}: ${from} → ${to}` +
            (notesTrim ? ` — notes: ${notesTrim}` : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          targetResourceId: existing.id,
          targetType: 'THEME',
          result: 'SUCCESS',
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: updated, from, to });
  } catch (error) {
    logger.error('Transition theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const POST = withRateLimit(30, 60_000)(transitionHandler);
