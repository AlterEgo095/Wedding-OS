export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger'; // P2-SEC-1
import { internalError } from '@/lib/api-errors'; // P2-CQ-5
import { writeAuditLog } from '@/lib/audit'; // P2-SEC-14
import { withRateLimit } from '@/lib/rate-limit'; // P2-SEC-6

/**
 * Generate a single JH-XXXXXX invitation code (6 hex chars, uppercased).
 */
function generateInvitationCode(): string {
  return `JH-${uuidv4().substring(0, 6).toUpperCase()}`;
}

/**
 * P2-PERF-1: Pre-generate unique invitation codes for ALL guests in a single
 * batch, using at most 1 + ceil(collisions/200) findMany queries instead of
 * up-to-10 findFirst queries per guest.
 *
 * Strategy:
 *   1. Generate one candidate code per guest.
 *   2. Single findMany({ where: { invitationCode: { in: allCodes } } }) → set
 *      of taken codes.
 *   3. For guests whose code is taken, regenerate. Loop with the new
 *      candidates until no collisions remain (bounded by 5 iterations).
 *
 * Returns a Map<guestKey, invitationCode> keyed by `${firstName}|${lastName}|${tableNumber}`
 * so the main loop can look up the pre-generated code in O(1) per guest.
 */
async function preGenerateInvitationCodes(
  guests: Array<{ firstName: string; lastName: string; tableNumber: number }>,
  weddingId: string,
): Promise<Map<string, string>> {
  const codeMap = new Map<string, string>();
  if (guests.length === 0) return codeMap;

  // Build the initial set of candidate codes, keyed by guestKey.
  const guestKeys: string[] = [];
  for (const g of guests) {
    const key = `${g.firstName}|${g.lastName}|${g.tableNumber}`;
    guestKeys.push(key);
    codeMap.set(key, generateInvitationCode());
  }

  // Iterate up to 5 times to resolve collisions.
  for (let iter = 0; iter < 5; iter++) {
    const codes = Array.from(codeMap.values());
    // Single findMany to check ALL candidate codes at once.
    // Explicit weddingId (Phase F defense-in-depth) — ALS propagation can
    // break across Next.js async boundaries; the explicit where guarantees
    // scoping even if the extension's getTenantContext() returns undefined.
    const conflicts = await tenantDb.guest.findMany({
      where: { weddingId, invitationCode: { in: codes } },
      select: { invitationCode: true },
    });
    if (conflicts.length === 0) break; // all codes are unique

    const takenSet = new Set(conflicts.map((c) => c.invitationCode));
    let regenCount = 0;
    for (const key of guestKeys) {
      const current = codeMap.get(key)!;
      if (takenSet.has(current)) {
        codeMap.set(key, generateInvitationCode());
        regenCount++;
      }
    }
    if (regenCount === 0) break; // safety: no progress, exit
  }

  return codeMap;
}

/* ══════════════════════════════════════════════════════════════
   DOCX Guest List Import API

   Parses Word documents with the following structure:
   - "Table N TABLENAME" as section headers
   - Guest names under each table (with optional prefixes like Couple, Sr, etc.)

   Supports:
   - Automatic table creation from document structure
   - Smart name parsing (Couple = 2 seats, individual = 1 seat)
   - Duplicate detection (by name + table combination)
   - Re-import support (merge mode)
   ══════════════════════════════════════════════════════════════ */

interface ParsedTable {
  number: number;
  name: string;
  guests: ParsedGuest[];
}

interface ParsedGuest {
  rawName: string;
  firstName: string;
  lastName: string;
  isCouple: boolean;
  seats: number;
  prefix: string;
}

interface ImportResult {
  tablesCreated: number;
  tablesUpdated: number;
  guestsCreated: number;
  guestsSkipped: number;
  duplicatesDetected: string[];
  errors: string[];
  details: {
    table: string;
    guestsAdded: string[];
    guestsSkipped: string[];
  }[];
}

/**
 * Parse DOCX text content into structured tables and guests
 */
function parseDocxContent(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentTable: ParsedTable | null = null;
  let tableCounter = 0;
  // Track sub-tables (e.g., two "Table 7" entries)
  const tableNumberMap = new Map<string, number>();

  for (const line of lines) {
    // Skip title line and total line
    if (line.toUpperCase().includes('LISTE DES INVITE') || line.toUpperCase().includes('TOTAL INVITE')) {
      continue;
    }

    // Check if this is a table header: "Table N NAME" or "TABLE N NAME"
    const tableMatch = line.match(/^(?:Table|TABLE)\s+(\d+)\s+(.+)$/i);

    if (tableMatch) {
      const originalNumber = parseInt(tableMatch[1], 10);
      const tableName = tableMatch[2].trim();

      // Handle duplicate table numbers (e.g., two "Table 7" entries)
      const key = `${originalNumber}-${tableName}`;
      if (!tableNumberMap.has(key)) {
        tableCounter++;
        tableNumberMap.set(key, tableCounter);
      }

      currentTable = {
        number: tableNumberMap.get(key)!,
        name: tableName,
        guests: [],
      };
      tables.push(currentTable);
      continue;
    }

    // If we're inside a table section, parse the guest name
    if (currentTable && line.length > 0) {
      const parsed = parseGuestName(line);
      if (parsed) {
        currentTable.guests.push(parsed);
      }
    }
  }

  return tables;
}

/**
 * Parse a guest name line into structured data
 * Handles prefixes: Couple, Coupe (typo), Sr, Ma, Mrs, Fr, Dr, Give, COUPLE
 */
function parseGuestName(raw: string): ParsedGuest | null {
  let cleaned = raw.trim();

  // Remove list paragraph markers (bullets, numbers)
  cleaned = cleaned.replace(/^[\s•·\-\d\.\)]+/, '').trim();

  if (!cleaned || cleaned.length < 2) return null;

  // Detect couple prefix
  const isCouple = /^(?:Couple|Coupe|COUPLE)\s+/i.test(cleaned);

  // Strip known prefixes
  const prefixes = ['Couple', 'Coupe', 'COUPLE', 'Sr', 'Ma', 'Mrs', 'Fr', 'Dr', 'Give'];
  let prefix = '';
  for (const p of prefixes) {
    const regex = new RegExp(`^${p}\\s+`, 'i');
    if (regex.test(cleaned)) {
      prefix = p;
      cleaned = cleaned.replace(regex, '').trim();
      break;
    }
  }

  if (!cleaned) return null;

  // Parse the remaining name into first and last name
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);

  let firstName: string;
  let lastName: string;

  if (parts.length === 1) {
    // Single name: use it as both first and last
    firstName = parts[0];
    lastName = parts[0];
  } else if (parts.length === 2) {
    firstName = parts[0];
    lastName = parts[1];
  } else {
    // Multiple parts: first word = first name, rest = last name
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  // Capitalize properly
  firstName = capitalizeName(firstName);
  lastName = capitalizeName(lastName);

  return {
    rawName: raw.trim(),
    firstName,
    lastName,
    isCouple,
    seats: isCouple ? 2 : 1,
    prefix,
  };
}

/**
 * Capitalize a name properly (first letter uppercase, rest as-is)
 */
function capitalizeName(name: string): string {
  if (!name) return name;
  // Handle names with apostrophes like "d'ART" -> "d'Art"
  return name.replace(/\b(\w)/g, (match) => match.toUpperCase())
    .replace(/^(Mc)(\w)/, (_, mc, letter) => mc + letter.toUpperCase());
}

/**
 * Determine the category based on table name or prefix
 */
function guessCategory(prefix: string, _tableName: string): string {
  if (prefix === 'Dr') return 'VIP';
  if (prefix === 'Sr' || prefix === 'Fr') return 'FAMILLE';
  return 'AMIS';
}

// P2-SEC-6: defined as a local function then wrapped on export so Next.js
// picks up the rate-limited version while the handler body stays readable.
async function docxImportHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
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
      const mergeMode = (formData.get('mergeMode') as string) || 'merge'; // 'merge' or 'replace'

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
      return NextResponse.json(
        { error: 'Le fichier doit être au format .docx ou .doc' },
        { status: 400 }
      );
    }

    // Read and parse the DOCX file using mammoth
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let textContent: string;
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      textContent = result.value;
    } catch (err) {
      // P2-SEC-1: structured logger; no stack leak.
      logger.error('DOCX parsing error', {
        errMessage: err instanceof Error ? err.message : String(err),
        errName: err instanceof Error ? err.name : 'Unknown',
      });
      return NextResponse.json(
        { error: 'Impossible de lire le fichier Word. Vérifiez le format.' },
        { status: 400 }
      );
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Le document est vide ou illisible' },
        { status: 400 }
      );
    }

    // Parse the document content
    const parsedTables = parseDocxContent(textContent);

    if (parsedTables.length === 0) {
      return NextResponse.json(
        { error: 'Aucune table trouvée dans le document. Le format attendu est "Table N NOM" suivi des invités.' },
        { status: 400 }
      );
    }

    const result: ImportResult = {
      tablesCreated: 0,
      tablesUpdated: 0,
      guestsCreated: 0,
      guestsSkipped: 0,
      duplicatesDetected: [],
      errors: [],
      details: [],
    };

    // If replace mode, delete all existing guests and tables (scoped to current tenant)
    if (mergeMode === 'replace') {
      try {
        await tenantDb.guest.deleteMany({ where: { weddingId: context.weddingId } }); // extension injects weddingId
        await tenantDb.table.deleteMany({ where: { weddingId: context.weddingId } });
      } catch (err) {
        // P2-SEC-1: structured logger; no stack leak.
        logger.error('Replace mode cleanup error', {
          errMessage: err instanceof Error ? err.message : String(err),
          errName: err instanceof Error ? err.name : 'Unknown',
        });
        result.errors.push('Erreur lors du nettoyage des données existantes');
      }
    }

    // P2-PERF-1: pre-generate invitation codes for ALL guests in one batch
    // (1 findMany instead of up-to-10 findFirst per guest).
    const allParsedGuests = parsedTables.flatMap((t) =>
      t.guests.map((g) => ({
        firstName: g.firstName,
        lastName: g.lastName,
        tableNumber: t.number,
      }))
    );
    const codeMap = await preGenerateInvitationCodes(allParsedGuests, context.weddingId);

    // P2-PERF-1: pre-resolve tables in a single batch to avoid 1 findFirst
    // per parsedTable. tenantDb auto-injects weddingId.
    const allTableNumbers = parsedTables.map((t) => t.number);
    const existingTables = await tenantDb.table.findMany({
      where: { weddingId: context.weddingId, number: { in: allTableNumbers } },
    });
    const tableByNumber = new Map(existingTables.map((t) => [t.number, t]));

    // Process each table — tenantDb auto-injects weddingId
    for (const parsedTable of parsedTables) {
      try {
        // Find or create the table (use pre-fetched map; tenant-scoped).
        let table = tableByNumber.get(parsedTable.number);

        if (table) {
          if (table.name !== parsedTable.name) {
            table = await tenantDb.table.update({
              where: { id: table.id },
              data: {
                name: parsedTable.name,
                capacity: Math.max(table.capacity, parsedTable.guests.length),
              },
            });
            result.tablesUpdated++;
          }
        } else {
          // P3: pass weddingId explicitly — extension auto-injects at runtime
          // but the static create-input type requires it.
          table = await tenantDb.table.create({
            data: {
              weddingId: context.weddingId,
              number: parsedTable.number,
              name: parsedTable.name,
              capacity: Math.max(8, parsedTable.guests.length),
            },
          });
          result.tablesCreated++;
        }

        const tableDetail = {
          table: `Table ${parsedTable.number} - ${parsedTable.name}`,
          guestsAdded: [] as string[],
          guestsSkipped: [] as string[],
        };

        // P2-PERF-1: batch-check duplicates for ALL guests in this table at
        // once instead of one findFirst per guest.
        const namePairs = parsedTable.guests.map((g) => ({
          firstName: g.firstName,
          lastName: g.lastName,
        }));
        const existingGuestsInTable = namePairs.length
          ? await tenantDb.guest.findMany({
              where: {
                weddingId: context.weddingId,
                tableId: table.id,
                OR: namePairs.map((p) => ({
                  firstName: p.firstName,
                  lastName: p.lastName,
                })),
              },
              select: { firstName: true, lastName: true },
            })
          : [];
        const existingGuestSet = new Set(
          existingGuestsInTable.map((g) => `${g.firstName}|${g.lastName}`)
        );

        // Process each guest in the table
        for (const parsedGuest of parsedTable.guests) {
          try {
            // P2-PERF-1: use the pre-fetched duplicate set instead of a
            // per-guest findFirst.
            if (existingGuestSet.has(`${parsedGuest.firstName}|${parsedGuest.lastName}`)) {
              result.guestsSkipped++;
              result.duplicatesDetected.push(
                `${parsedGuest.firstName} ${parsedGuest.lastName} (Table ${parsedTable.number})`
              );
              tableDetail.guestsSkipped.push(
                `${parsedGuest.firstName} ${parsedGuest.lastName}`
              );
              continue;
            }

            // P2-PERF-1: use the pre-generated code from the batch lookup.
            const guestKey = `${parsedGuest.firstName}|${parsedGuest.lastName}|${parsedTable.number}`;
            const invitationCode = codeMap.get(guestKey) || generateInvitationCode();

            // Determine category
            const category = guessCategory(parsedGuest.prefix, parsedTable.name);

            // Create the guest
            // Auto-generate displayName based on invitation type
            const invitationType = parsedGuest.isCouple ? 'couple' : 'individuel';
            const displayName = parsedGuest.isCouple
              ? `Couple ${parsedGuest.lastName}`
              : `${parsedGuest.firstName} ${parsedGuest.lastName}`;

            // tenantDb.guest.create auto-injects weddingId from context.
            // P3: pass weddingId explicitly to satisfy Prisma's static types.
            await tenantDb.guest.create({
              data: {
                weddingId: context.weddingId,
                firstName: parsedGuest.firstName,
                lastName: parsedGuest.lastName,
                displayName,
                invitationType,
                tableId: table.id,
                seats: parsedGuest.seats,
                category,
                status: 'PENDING',
                invitationCode,
              },
            });

            result.guestsCreated++;
            tableDetail.guestsAdded.push(
              `${parsedGuest.firstName} ${parsedGuest.lastName}${parsedGuest.isCouple ? ' (Couple)' : ''}`
            );
          } catch (guestErr) {
            const errMsg = `Erreur pour ${parsedGuest.firstName} ${parsedGuest.lastName}: ${guestErr instanceof Error ? guestErr.message : 'Erreur inconnue'}`;
            result.errors.push(errMsg);
          }
        }

        result.details.push(tableDetail);
      } catch (tableErr) {
        const errMsg = `Erreur table ${parsedTable.number}: ${tableErr instanceof Error ? tableErr.message : 'Erreur inconnue'}`;
        result.errors.push(errMsg);
      }
    }

    // Log the import action
    // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: context.weddingId,
      userId: user.id,
      action: 'IMPORT_DOCX_GUESTS',
      details: `Import DOCX: ${result.guestsCreated} invités créés, ${result.guestsSkipped} doublons ignorés, ${result.tablesCreated} tables créées, mode: ${mergeMode}`,
      request,
    });

    return NextResponse.json(result);
    }); // end runWithTenant
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('DOCX import error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// P2-SEC-6: rate-limit the POST handler (5 requests / 60s per IP).
// DOCX parsing + per-guest create is CPU+DB heavy — a 200-guest upload can
// take 5-30s and would block other tenants if flooded.
export const POST = withRateLimit(5, 60_000)(docxImportHandler);
