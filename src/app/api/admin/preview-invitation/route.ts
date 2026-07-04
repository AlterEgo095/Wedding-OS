// ══════════════════════════════════════════════════════════════════════════════
// /api/admin/preview-invitation — Phase 3 admin preview endpoint (GAP-5)
// ══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/preview-invitation?guestId=<cuid>
//
// Returns the same payload shape as /api/guest/me PLUS the wedding's Settings
// map, but WITHOUT:
//   - creating a guest_session cookie
//   - validating a guest session fingerprint
//   - logging a VIEW_INVITATION guest access event (only an admin PREVIEW_INVITATION audit log)
//
// Auth: PLATFORM_ADMIN or ORGANIZER only. Tenant-scoped via the
// X-Wedding-Slug header (set by the admin fetch interceptor) — the guest
// must belong to the resolved wedding (assertWeddingAccess enforces this).
//
// Use case: the wedding admin's "Aperçu Invitation" tab lets the organizer
// pick any guest from their wedding and see exactly what that guest will
// see when they open their invitation link — without impersonating the guest
// or creating a session that could leak into other admin actions.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { generateInvitationLinkToken } from '@/lib/guest-auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest, internalError } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const guestId = request.nextUrl.searchParams.get('guestId');
      if (!guestId) return badRequest('Paramètre guestId requis');

      // Tenant-scoped lookup. We add `weddingId: ctx.weddingId` EXPLICITLY
      // (belt + suspenders) — the tenant-scoped Prisma extension SHOULD
      // auto-inject it via runWithTenant, but an audit found that the
      // auto-injection is unreliable in some Next.js request paths (the
      // extension's getTenantContext() may return undefined when ALS context
      // propagation breaks across async boundaries). The explicit where
      // guarantees no cross-tenant leak even if the extension silently
      // passes through.
      const guest = await tenantDb.guest.findFirst({
        where: { id: guestId, weddingId: ctx.weddingId },
        include: {
          table: { select: { id: true, name: true, number: true } },
        },
      });

      if (!guest) {
        return NextResponse.json(
          { error: 'Invité introuvable dans ce mariage' },
          { status: 404 }
        );
      }

      // Fetch all settings for this wedding (so the preview can render
      // couple names, venue, hashtag, photos, etc. exactly as the guest
      // would see them).
      const settingsRows = await db.settings.findMany({
        where: { weddingId: ctx.weddingId },
        select: { key: true, value: true },
      });
      const settings: Record<string, string> = {};
      for (const row of settingsRows) {
        if (row.value != null) settings[row.key] = row.value;
      }

      // Best-effort theme fetch — the admin preview passes this to
      // GuestPersonalSpace as the `theme` prop so the download JSX uses
      // resolved hex values (html2canvas-pro).
      const themeRow = await db.theme.findUnique({
        where: { weddingId: ctx.weddingId },
        select: {
          primaryColor: true,
          accentColor: true,
          fontDisplay: true,
          fontBody: true,
          layout: true,
          customizations: true,
        },
      });

      // Parse customizations defensively — may contain luxury, penpot,
      // collectionMeta, variantSelections, designSystem.
      let customizations: Record<string, unknown> | null = null;
      if (themeRow?.customizations) {
        try {
          const parsed = JSON.parse(themeRow.customizations);
          if (parsed && typeof parsed === 'object') {
            customizations = parsed as Record<string, unknown>;
          }
        } catch {
          customizations = null;
        }
      }

      // Active Collection binding (so the preview shows which Collection is
      // currently deployed — informational only at this point).
      const binding = await db.weddingCollectionBinding.findUnique({
        where: { weddingId: ctx.weddingId },
        select: {
          id: true,
          collectionId: true,
          collectionVersion: true,
          status: true,
          deployedAt: true,
          manifest: true,
        },
      });
      let bindingManifest: Record<string, unknown> | null = null;
      if (binding?.manifest) {
        try {
          bindingManifest = JSON.parse(binding.manifest);
        } catch {
          bindingManifest = null;
        }
      }

      // Audit log — admin preview action (NOT a guest VIEW_INVITATION event).
      // This keeps the guest access log clean (no false "guest viewed" entries
      // triggered by admin previews).
      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'PREVIEW_INVITATION',
        details: `Admin previewed invitation for guest ${guest.firstName} ${guest.lastName} (${guest.id})`,
        request,
      });

      // Shape mirrors /api/guest/me + adds settings + theme + binding.
      // The encryptedLink is computed from the guest's invitationCode so the
      // preview can show what the guest's personal link looks like — but it
      // is NOT usable by the admin (the link only authenticates the guest
      // via /api/guest/invite, which creates a guest_session cookie that
      // overwrites any existing admin session — clicking the link in the
      // admin preview would log the admin out of their admin session).
      const encryptedLink = generateInvitationLinkToken(guest.invitationCode);

      return NextResponse.json({
        guest: {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          displayName: guest.displayName,
          invitationType: guest.invitationType,
          invitationCode: guest.invitationCode,
          seats: guest.seats,
          category: guest.category,
          status: guest.status,
          personalMessage: guest.personalMessage,
          checkedIn: guest.checkedIn,
          table: guest.table,
          invitationViewed: guest.invitationViewed,
          invitationViewCount: guest.invitationViewCount,
          lastAccessAt: guest.lastAccessAt,
          encryptedLink,
        },
        settings,
        theme: themeRow
          ? {
              primaryColor: themeRow.primaryColor,
              accentColor: themeRow.accentColor,
              fontDisplay: themeRow.fontDisplay,
              fontBody: themeRow.fontBody,
              layout: themeRow.layout,
              customizations,
              luxury: customizations?.luxury ?? null,
              binding: binding
                ? {
                    id: binding.id,
                    collectionId: binding.collectionId,
                    collectionVersion: binding.collectionVersion,
                    status: binding.status,
                    deployedAt: binding.deployedAt,
                    manifest: bindingManifest,
                  }
                : null,
              wedding: {
                slug: ctx.slug,
                isDefault: ctx.isDefault,
                status: ctx.status,
                plan: ctx.plan,
              },
            }
          : null,
        preview: true, // marker so the frontend knows this is admin preview mode
      });
    });
  } catch (error) {
    logger.error('Admin preview-invitation error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
