export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';

// GET /api/settings — public, returns all settings for the resolved wedding
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const settings = await tenantDb.settings.findMany({
      orderBy: { key: 'asc' },
      // weddingId is auto-injected by the tenant-scoped extension
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    return NextResponse.json({ settings: settingsMap, wedding: { slug: ctx.slug, isDefault: ctx.isDefault, status: ctx.status, plan: ctx.plan } });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Get settings error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

// PUT /api/settings — admin only, updates settings for the resolved wedding
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['SUPER_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { settings } = body as { settings: Record<string, string> };

      if (!settings || typeof settings !== 'object') {
        return NextResponse.json({ error: 'Settings object is required' }, { status: 400 });
      }

      // Upsert each setting using the composite unique key [weddingId, key]
      const upsertPromises = Object.entries(settings).map(([key, value]) =>
        tenantDb.settings.upsert({
          where: { weddingId_key: { weddingId: ctx.weddingId, key } },
          update: { value },
          create: { weddingId: ctx.weddingId, key, value },
        })
      );
      await Promise.all(upsertPromises);

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'UPDATE_SETTINGS',
          details: `Updated ${Object.keys(settings).length} settings`,
        },
      });

      const updatedSettings = await tenantDb.settings.findMany({ orderBy: { key: 'asc' } });
      const settingsMap: Record<string, string> = {};
      for (const s of updatedSettings) settingsMap[s.key] = s.value;

      return NextResponse.json({ settings: settingsMap });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Update settings error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
