export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';

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

export async function POST(request: NextRequest) {
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
      console.error('DOCX parsing error:', err);
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
        await tenantDb.guest.deleteMany({}); // extension injects weddingId
        await tenantDb.table.deleteMany({});
      } catch (err) {
        console.error('Replace mode cleanup error:', err);
        result.errors.push('Erreur lors du nettoyage des données existantes');
      }
    }

    // Process each table — tenantDb auto-injects weddingId
    for (const parsedTable of parsedTables) {
      try {
        // Find or create the table (scoped to current tenant by extension)
        let table = await tenantDb.table.findFirst({
          where: { number: parsedTable.number },
        });

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
          table = await tenantDb.table.create({
            data: {
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

        // Process each guest in the table
        for (const parsedGuest of parsedTable.guests) {
          try {
            // Check for duplicates (scoped to current tenant by extension)
            const existingGuest = await tenantDb.guest.findFirst({
              where: {
                firstName: parsedGuest.firstName,
                lastName: parsedGuest.lastName,
                tableId: table.id,
              },
            });

            if (existingGuest) {
              result.guestsSkipped++;
              result.duplicatesDetected.push(
                `${parsedGuest.firstName} ${parsedGuest.lastName} (Table ${parsedTable.number})`
              );
              tableDetail.guestsSkipped.push(
                `${parsedGuest.firstName} ${parsedGuest.lastName}`
              );
              continue;
            }

            // Generate unique invitation code (scoped unique [weddingId, invitationCode])
            let invitationCode: string;
            let codeAttempts = 0;
            do {
              invitationCode = `JH-${uuidv4().substring(0, 6).toUpperCase()}`;
              codeAttempts++;
              // Use findFirst so the extension can scope by weddingId
              const existing = await tenantDb.guest.findFirst({
                where: { invitationCode },
              });
              if (!existing) break;
            } while (codeAttempts < 10);

            // Determine category
            const category = guessCategory(parsedGuest.prefix, parsedTable.name);

            // Create the guest
            // Auto-generate displayName based on invitation type
            const invitationType = parsedGuest.isCouple ? 'couple' : 'individuel';
            const displayName = parsedGuest.isCouple
              ? `Couple ${parsedGuest.lastName}`
              : `${parsedGuest.firstName} ${parsedGuest.lastName}`;

            // tenantDb.guest.create auto-injects weddingId from context
            await tenantDb.guest.create({
              data: {
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
    await db.auditLog.create({
      data: {
        weddingId: context.weddingId,
        userId: user.id,
        action: 'IMPORT_DOCX_GUESTS',
        details: `Import DOCX: ${result.guestsCreated} invités créés, ${result.guestsSkipped} doublons ignorés, ${result.tablesCreated} tables créées, mode: ${mergeMode}`,
      },
    });

    return NextResponse.json(result);
    }); // end runWithTenant
  } catch (error) {
    console.error('DOCX import error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur lors de l\'import' },
      { status: 500 }
    );
  }
}
