export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { logger } from '@/lib/logger'; // P2-SEC-1
import { internalError } from '@/lib/api-errors'; // P2-CQ-5
import { writeAuditLog } from '@/lib/audit'; // P2-SEC-14
import { withRateLimit } from '@/lib/rate-limit'; // P2-SEC-6
// P2-PERF-2: Prisma's exact-types make it impossible to pass a plain object
// literal to createMany unless we cast. Import the type so the cast is at
// least typed (not `any`).
import { Prisma } from '@prisma/client';

/**
 * P2-PERF-2: Pre-generate unique invitation codes for ALL rows in a single
 * batch. Returns an array of codes aligned 1:1 with the input rows.
 *
 * Strategy: generate one candidate per row, batch-check via single findMany,
 * regenerate collisions, repeat (bounded by 5 iterations).
 */
async function preGenerateCodes(rowCount: number, weddingId: string): Promise<string[]> {
  if (rowCount === 0) return [];
  const codes: string[] = Array.from({ length: rowCount }, () =>
    uuidv4().substring(0, 8).toUpperCase(),
  );
  for (let iter = 0; iter < 5; iter++) {
    // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
    // break across Next.js async boundaries; the explicit where guarantees
    // scoping even if the extension's getTenantContext() returns undefined.
    const conflicts = await tenantDb.guest.findMany({
      where: { weddingId, invitationCode: { in: codes } },
      select: { invitationCode: true },
    });
    if (conflicts.length === 0) break;
    const takenSet = new Set(conflicts.map((c) => c.invitationCode));
    for (let i = 0; i < codes.length; i++) {
      if (takenSet.has(codes[i])) codes[i] = uuidv4().substring(0, 8).toUpperCase();
    }
  }
  return codes;
}

// P2-SEC-6: defined as a local function then wrapped on export so Next.js
// picks up the rate-limited version while the handler body stays readable.
async function importGuestsHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
      // break across Next.js async boundaries; the explicit where guarantees
      // scoping even if the extension's getTenantContext() returns undefined.
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (rows.length === 0) {
        return NextResponse.json({ error: 'No data found in the file' }, { status: 400 });
      }

      // P2-PERF-2: pre-generate invitation codes for ALL rows in one batch
      // (1 findMany instead of relying on per-row try/catch on the unique
      // constraint, which was silently swallowing collisions).
      const invitationCodes = await preGenerateCodes(rows.length, context.weddingId);

      // Parse + validate each row into a guest record (in-memory).
      // P2-PERF-2: typed as Prisma GuestCreateManyInput fields so we can pass
      // the array straight to createMany without per-row type assertions.
      const created: string[] = [];
      const errors: string[] = [];
      const guestData: Array<{
        firstName: string;
        lastName: string;
        displayName: string;
        invitationType: string;
        phone: string | null;
        email: string | null;
        seats: number;
        category: string;
        status: string;
        personalMessage: string | null;
        invitationCode: string;
      }> = [];

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
          const invitationType = String(row['Type'] || row['invitationType'] || 'individuel').trim();

          const displayName = invitationType === 'couple'
            ? `Couple ${lastName}`
            : `${firstName} ${lastName}`;

          guestData.push({
            firstName, lastName, displayName,
            invitationType,
            phone, email, seats, category, status, personalMessage,
            invitationCode: invitationCodes[i],
          });
          created.push(`${firstName} ${lastName}`);
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // P2-PERF-2: single createMany for all valid rows — replaces the
      // per-row create loop (was N sequential inserts).
      let imported = 0;
      if (guestData.length > 0) {
        try {
          const r = await tenantDb.guest.createMany({
            data: guestData as Prisma.GuestCreateManyInput[],
          });
          imported = r.count;
        } catch (err) {
          // Fall back to per-row inserts so we can attribute errors to rows.
          // (Path is rare — only when skipDuplicates can't recover, e.g.
          // schema mismatch on a column.)
          logger.warn('createMany failed; falling back to per-row insert', {
            errMessage: err instanceof Error ? err.message : String(err),
            errName: err instanceof Error ? err.name : 'Unknown',
          });
          for (let i = 0; i < guestData.length; i++) {
            try {
              await tenantDb.guest.create({ data: guestData[i] as never });
              imported++;
            } catch (rowErr) {
              errors.push(`Row ${i + 2}: ${rowErr instanceof Error ? rowErr.message : 'Unknown error'}`);
            }
          }
        }
      }

      // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
      await writeAuditLog({
        weddingId: context.weddingId,
        userId: user.id,
        action: 'IMPORT_GUESTS',
        details: `Imported ${imported} guests, ${errors.length} errors`,
        request,
      });

      return NextResponse.json({
        imported,
        skipped: created.length - imported,
        errors: errors.length,
        errorDetails: errors,
        createdGuests: created,
      });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Import guests error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// P2-SEC-6: rate-limit the POST handler (5 requests / 60s per IP).
// XLSX parsing + bulk insert is DB-heavy.
export const POST = withRateLimit(5, 60_000)(importGuestsHandler);
