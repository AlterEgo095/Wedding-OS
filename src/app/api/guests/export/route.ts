export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const guests = await db.guest.findMany({
      include: {
        table: {
          select: {
            name: true,
            number: true,
          },
        },
      },
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

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Prénom
      { wch: 15 }, // Nom
      { wch: 15 }, // Téléphone
      { wch: 25 }, // Email
      { wch: 15 }, // Table
      { wch: 12 }, // Numéro Table
      { wch: 8 },  // Places
      { wch: 12 }, // Catégorie
      { wch: 12 }, // Statut
      { wch: 15 }, // Code Invitation
      { wch: 10 }, // Check-in
      { wch: 30 }, // Message Personnel
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Invités');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=guests-export.xlsx',
      },
    });
  } catch (error) {
    console.error('Export guests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
