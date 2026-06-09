export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in the file' },
        { status: 400 }
      );
    }

    const created: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const firstName = String(row['Prénom'] || row['firstName'] || row['prenom'] || '').trim();
        const lastName = String(row['Nom'] || row['lastName'] || row['nom'] || '').trim();

        if (!firstName || !lastName) {
          errors.push(`Row ${i + 2}: Missing first name or last name`);
          continue;
        }

        const phone = String(row['Téléphone'] || row['phone'] || row['telephone'] || '').trim() || null;
        const email = String(row['Email'] || row['email'] || '').trim() || null;
        const category = String(row['Catégorie'] || row['category'] || row['categorie'] || 'AMIS').trim();
        const seats = parseInt(String(row['Places'] || row['seats'] || '1'), 10) || 1;
        const status = String(row['Statut'] || row['status'] || 'PENDING').trim();
        const personalMessage = String(row['Message Personnel'] || row['personalMessage'] || '').trim() || null;

        const invitationCode = uuidv4().substring(0, 8).toUpperCase();

        // Auto-generate displayName from firstName/lastName
        const displayName = `${firstName} ${lastName}`;

        await db.guest.create({
          data: {
            firstName,
            lastName,
            displayName,
            phone,
            email,
            seats,
            category,
            status,
            personalMessage,
            invitationCode,
          },
        });

        created.push(`${firstName} ${lastName}`);
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'IMPORT_GUESTS',
        details: `Imported ${created.length} guests, ${errors.length} errors`,
      },
    });

    return NextResponse.json({
      imported: created.length,
      errors: errors.length,
      errorDetails: errors,
      createdGuests: created,
    });
  } catch (error) {
    console.error('Import guests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
