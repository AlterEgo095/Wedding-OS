/**
 * GET /api/guests/export — exports the wedding's guest list as an .xlsx file.
 *
 * P2-PERF-3: the export is capped at EXPORT_MAX_ROWS (5000) rows to keep the
 * XLSX generation step bounded. When the cap is hit, the response carries an
 * `X-Export-Capped: true` header and a `logger.warn` is emitted so ops can
 * detect weddings that exceed the limit (they should be migrated to streaming
 * exports — see P2-PERF-3 follow-up). The cap was chosen because 5000 rows ×
 * ~12 columns ≈ 60k cells, which XLSX.utils.json_to_sheet handles in <1s.
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
import * as XLSX from 'xlsx';

/** P2-PERF-3: hard cap on exported rows to bound XLSX generation time. */
const EXPORT_MAX_ROWS = 5000;

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
      // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
      // break across Next.js async boundaries; the explicit where guarantees
      // scoping even if the extension's getTenantContext() returns undefined.
      const guests = await tenantDb.guest.findMany({
        where: { weddingId: context.weddingId },
        include: { table: { select: { name: true, number: true } } },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_MAX_ROWS, // P2-PERF-3: bound export size
      });

      // P2-PERF-3: detect cap hit. `take` clamps the result to exactly
      // EXPORT_MAX_ROWS, so hitting that count means we likely truncated.
      const capped = guests.length === EXPORT_MAX_ROWS;
      if (capped) {
        logger.warn('guests-export-capped', { count: guests.length, slug: context.slug });
      }

      const data = guests.map((g) => ({
        'Prénom': g.firstName,
        'Nom': g.lastName,
        'Téléphone': g.phone || '',
        'Email': g.email || '',
        'Table': g.table?.name || '',
        'Numéro Table': g.table?.number || '',
        'Places': g.seats,
        'Catégorie': g.category,
        'Statut': g.status,
        'Code Invitation': g.invitationCode,
        'Check-in': g.checkedIn ? 'Oui' : 'Non',
        'Message Personnel': g.personalMessage || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
        { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 30 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Invités');

      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=guests-${context.slug}-export.xlsx`,
      };
      if (capped) {
        // P2-PERF-3: signal truncation to clients so they can warn the user.
        responseHeaders['X-Export-Capped'] = 'true';
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: responseHeaders,
      });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Export guests error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
