export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const guests = await tenantDb.guest.findMany({
        include: { table: { select: { name: true, number: true } } },
        orderBy: { createdAt: 'desc' },
      });

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

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=guests-${context.slug}-export.xlsx`,
        },
      });
    });
  } catch (error) {
    console.error('Export guests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
