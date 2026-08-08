export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getTemplate, normalizeHexColor } from '@/lib/themes/templates';
// P2-CQ-5: standardised API errors.
import { badRequest } from '@/lib/api-errors';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

// POST /api/theme/apply-template — ORGANIZER+, applies a predefined template
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { templateId } = body as { templateId?: string };

      if (!templateId) {
        return NextResponse.json({ error: 'templateId est requis' }, { status: 400 });
      }

      const template = getTemplate(templateId);
      if (!template) {
        return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
      }

      // Apply template values
      const theme = await db.theme.upsert({
        where: { weddingId: ctx.weddingId },
        update: {
          primaryColor: normalizeHexColor(template.primaryColor),
          accentColor: normalizeHexColor(template.accentColor),
          fontDisplay: template.fontDisplay,
          fontBody: template.fontBody,
          layout: template.layout,
        },
        create: {
          weddingId: ctx.weddingId,
          primaryColor: normalizeHexColor(template.primaryColor),
          accentColor: normalizeHexColor(template.accentColor),
          fontDisplay: template.fontDisplay,
          fontBody: template.fontBody,
          layout: template.layout,
        },
      });

      // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'APPLY_THEME_TEMPLATE',
        details: `Applied template: ${template.name} (${template.id})`,
        request,
      });

      return NextResponse.json({
        template: { id: template.id, name: template.name },
        theme: {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          fontDisplay: theme.fontDisplay,
          fontBody: theme.fontBody,
          layout: theme.layout,
        },
      });
    });
  } catch (error) {
    logger.error('Apply theme template error', { err: error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
