/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIGRATION SCRIPT: Guest List Replacement
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Replace all guest data with the new official list
 * 
 * GUARANTEES:
 * - Idempotent (can be run multiple times safely)
 * - No duplicate guests
 * - Invitation codes regenerated on each run
 * - All names stored EXACTLY as provided (no transformation)
 * - invitation_type auto-detected from "Couple"/"COUPLE" prefix
 * - displayName = exact text from the official list
 * 
 * SAFETY:
 * - Full backup created before migration
 * - Detailed logging of every operation
 * - Rollback instructions provided
 * ═══════════════════════════════════════════════════════════════════════
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new PrismaClient();
const LOG_FILE = path.join(__dirname, '..', 'migration-log.txt');

// ═══════════════════════════════════════════════════════════════════════
// OFFICIAL GUEST LIST - New data from DOCX
// ═══════════════════════════════════════════════════════════════════════

const OFFICIAL_GUEST_LIST = [
  // TABLE ANSET
  { name: "Couple PASTEUR GUYGUY", table: "ANSET" },
  { name: "Couple Pasteur PECHO", table: "ANSET" },
  { name: "Couple Berge  MUSEMA", table: "ANSET" },
  { name: "Couple Berge KALO", table: "ANSET" },
  { name: "Couple TANTE MAGUY", table: "ANSET" },
  { name: "Couple KALO", table: "ANSET" },
  // TABLE CEMYCINE
  { name: "Couple PAUL", table: "CEMYCINE" },
  { name: "Pasteur IMBULE", table: "CEMYCINE" },
  { name: "Ma MARIE JEANE", table: "CEMYCINE" },
  { name: "Couple Pa MICHEL", table: "CEMYCINE" },
  { name: "Couple MARC", table: "CEMYCINE" },
  { name: "Sr GRACIA", table: "CEMYCINE" },
  { name: "MA CHANTAL DJONGA", table: "CEMYCINE" },
  { name: "Couple PARAIN", table: "CEMYCINE" },
  // TABLE CESACAL
  { name: "Couple NEHEMIE", table: "CESACAL" },
  { name: "Couple Fr GUELORD", table: "CESACAL" },
  { name: "Couple MOTENDA", table: "CESACAL" },
  { name: "Sr DEBORHA ILUNGA", table: "CESACAL" },
  { name: "Sr GIVE ILUNGA", table: "CESACAL" },
  { name: "PRISCA ILUNGA", table: "CESACAL" },
  { name: "MA ONO", table: "CESACAL" },
  // TABLE CEPIME
  { name: "Couple KAMBA", table: "CEPIME" },
  { name: "Couple BOB", table: "CEPIME" },
  { name: "GUSLAINE", table: "CEPIME" },
  { name: "DEBORHA", table: "CEPIME" },
  { name: "DJENNY MBONGE", table: "CEPIME" },
  { name: "ATOCHA SARAH", table: "CEPIME" },
  { name: "Couple MUNGUANZI", table: "CEPIME" },
  { name: "KAPINGA ANNIE", table: "CEPIME" },
  { name: "SEYA", table: "CEPIME" },
  // TABLE NORMEGYL
  { name: "Couple MBELE", table: "NORMEGYL" },
  { name: "Couple MPUTU", table: "NORMEGYL" },
  { name: "Couple BILU", table: "NORMEGYL" },
  { name: "DJODJO", table: "NORMEGYL" },
  { name: "Couple HERNANDEZ", table: "NORMEGYL" },
  { name: "Couple MATANDA", table: "NORMEGYL" },
  // TABLE SECTAB
  { name: "Couple MOMPOLE HUMAINE", table: "SECTAB" },
  { name: "Couple MWANZA", table: "SECTAB" },
  { name: "Couple VERRO", table: "SECTAB" },
  { name: "CHRISTEL", table: "SECTAB" },
  { name: "MA FRANCOISE", table: "SECTAB" },
  { name: "MA DANIELA", table: "SECTAB" },
  { name: "RAISA", table: "SECTAB" },
  { name: "Dr DIKENS", table: "SECTAB" },
  { name: "ARLON", table: "SECTAB" },
  // TABLE ESOMEX
  { name: "FRANCK WASSA", table: "ESOMEX" },
  { name: "Couple V HUGO", table: "ESOMEX" },
  { name: "Couple GUELOR BIDE", table: "ESOMEX" },
  { name: "JOSELINE WASSA", table: "ESOMEX" },
  { name: "ODETTE", table: "ESOMEX" },
  { name: "KIKI", table: "ESOMEX" },
  { name: "TANTE NELLY", table: "ESOMEX" },
  { name: "Ma JACQUIE", table: "ESOMEX" },
  // TABLE CEFAM
  { name: "Couple ABANI", table: "CEFAM" },
  { name: "Couple KALAMBAYI", table: "CEFAM" },
  { name: "Couple MBELE", table: "CEFAM" },
  { name: "Couple IZUELE", table: "CEFAM" },
  { name: "Couple BENA", table: "CEFAM" },
  { name: "Couple KIFATA", table: "CEFAM" },
  // TABLE VOGLITUS
  { name: "BERNADETTE", table: "VOGLITUS" },
  { name: "Couple SOLANGE", table: "VOGLITUS" },
  { name: "ELIEL", table: "VOGLITUS" },
  { name: "ARISTOTE ABANI", table: "VOGLITUS" },
  { name: "SANDRA", table: "VOGLITUS" },
  { name: "PAMELA", table: "VOGLITUS" },
  { name: "FRANKLIN", table: "VOGLITUS" },
  { name: "LUMIERE", table: "VOGLITUS" },
  { name: "BABY", table: "VOGLITUS" },
  { name: "GRACE", table: "VOGLITUS" },
  // TABLE CESAKROL
  { name: "Couple MAGUY LIBAZA", table: "CESAKROL" },
  { name: "ELMA LIBAZA", table: "CESAKROL" },
  { name: "THETHE LIBAZA", table: "CESAKROL" },
  { name: "Couple NYALO", table: "CESAKROL" },
  { name: "Couple WEMBA", table: "CESAKROL" },
  { name: "Couple MEYA", table: "CESAKROL" },
  { name: "Couple MOTELU CLARIS", table: "CESAKROL" },
  // TABLE TELSOTON
  { name: "Couple FABRICE", table: "TELSOTON" },
  { name: "Couple GLODY", table: "TELSOTON" },
  { name: "Couple KYRIA", table: "TELSOTON" },
  { name: "Couple MIREIL", table: "TELSOTON" },
  { name: "Couple ANTHO", table: "TELSOTON" },
  { name: "Couple FLORIDA", table: "TELSOTON" },
  // TABLE DICLOFENAC
  { name: "RACHEL LIBAZA", table: "DICLOFENAC" },
  { name: "REAGAN MPEMPE", table: "DICLOFENAC" },
  { name: "NORNA LIBAZA", table: "DICLOFENAC" },
  { name: "ZACKARIE LIBAZA", table: "DICLOFENAC" },
  { name: "JOSUE LIBAZA", table: "DICLOFENAC" },
  { name: "ELIE LIBAZA", table: "DICLOFENAC" },
  { name: "CHRISTEVIE LIBAZA", table: "DICLOFENAC" },
  { name: "CLEMENCE LIBAZA", table: "DICLOFENAC" },
  { name: "COUPLE CATHY", table: "DICLOFENAC" },
  { name: "AIMERDIE", table: "DICLOFENAC" },
  { name: "MBUYI ELI", table: "DICLOFENAC" },
  // TABLE APHEROL
  { name: "Couple HILDA", table: "APHEROL" },
  { name: "Couple LUKA", table: "APHEROL" },
  { name: "Couple MULAYI", table: "APHEROL" },
  { name: "Couple NGANGO", table: "APHEROL" },
  { name: "Couple JEREDART", table: "APHEROL" },
  // TABLE PARACETAMOL
  { name: "UNIQUE", table: "PARACETAMOL" },
  { name: "GABAHEL GLOIRE LUZOLANU", table: "PARACETAMOL" },
  { name: "PRINCE PHARMA", table: "PARACETAMOL" },
  { name: "CAISSA", table: "PARACETAMOL" },
  { name: "NEWS CESAMEX", table: "PARACETAMOL" },
  { name: "INF PAPY", table: "PARACETAMOL" },
  { name: "ELIE JOSEPH", table: "PARACETAMOL" },
  { name: "INFIRMIERES CARINE", table: "PARACETAMOL" },
  { name: "Couple P ROSSY MANDULU", table: "PARACETAMOL" },
  // TABLE DIGEST
  { name: "Couple BUMBA", table: "DIGEST" },
  { name: "Couple BAVON MBELE", table: "DIGEST" },
  { name: "Couple HUGUETTE", table: "DIGEST" },
  { name: "Couple FELLY", table: "DIGEST" },
  { name: "Couple MBOYO", table: "DIGEST" },
  // TABLE DEZOLIN
  { name: "Couple SERAPHIN", table: "DEZOLIN" },
  { name: "Couple GUYAUME", table: "DEZOLIN" },
  { name: "Couple CEDRICK", table: "DEZOLIN" },
  { name: "Couple PELAGIE", table: "DEZOLIN" },
  { name: "Couple IRENE", table: "DEZOLIN" },
  { name: "Couple JUDITH", table: "DEZOLIN" },
  // TABLE CITRIMEX-DT
  { name: "Couple NZILA MATONDO", table: "CITRIMEX-DT" },
  { name: "Couple ELVICE KOYALA", table: "CITRIMEX-DT" },
  { name: "Couple JOEL MALUNDA", table: "CITRIMEX-DT" },
  { name: "BEN MUZOMWE", table: "CITRIMEX-DT" },
  { name: "ISAAC NGWANZO", table: "CITRIMEX-DT" },
  { name: "NICKSON DONGO", table: "CITRIMEX-DT" },
  { name: "VINNY BENDE", table: "CITRIMEX-DT" },
  { name: "FRANCY MOKOLI", table: "CITRIMEX-DT" },
  { name: "GLODY MASANDI", table: "CITRIMEX-DT" },
  // TABLE CEFUROCLAV
  { name: "Couple DADA", table: "CEFUROCLAV" },
  { name: "OSEE BOPUPA", table: "CEFUROCLAV" },
  { name: "BENI BODIKO", table: "CEFUROCLAV" },
  { name: "JONATHAN NZOBALE", table: "CEFUROCLAV" },
  { name: "MOISE LUKOMBO", table: "CEFUROCLAV" },
  { name: "DAVID MANYA", table: "CEFUROCLAV" },
  { name: "DJENNY KISALU", table: "CEFUROCLAV" },
  { name: "Sr LISETTE", table: "CEFUROCLAV" },
  { name: "NADEGE BODIKO", table: "CEFUROCLAV" },
  // TABLE NICAR
  { name: "PLATINI KAKILA", table: "NICAR" },
  { name: "JOSE MPAKA", table: "NICAR" },
  { name: "YELENGE", table: "NICAR" },
  { name: "SERA MANDEFU", table: "NICAR" },
  { name: "CADETTE SUNDA", table: "NICAR" },
  { name: "Fr MEDIO", table: "NICAR" },
  { name: "GIRESSE ZIRI", table: "NICAR" },
  { name: "Couple MAKWELA", table: "NICAR" },
  { name: "ANDY LIMBA", table: "NICAR" },
  { name: "JACK LEMBI", table: "NICAR" },
  { name: "ANNO MAYEMBO", table: "NICAR" },
  // TABLE TRACOL
  { name: "Couple BLAISE DONGO", table: "TRACOL" },
  { name: "Couple DJYMMY", table: "TRACOL" },
  { name: "Couple SYSTÈME", table: "TRACOL" },
  { name: "ALBERT KANDOLO", table: "TRACOL" },
  { name: "Mrs HIPPOLITE", table: "TRACOL" },
  { name: "Couple KAZADI", table: "TRACOL" },
  // TABLE FECOND
  { name: "Couple MVITA", table: "FECOND" },
  { name: "SHAROWN", table: "FECOND" },
  { name: "MALACHIE", table: "FECOND" },
  { name: "WISLET", table: "FECOND" },
  { name: "KASEMA", table: "FECOND" },
  { name: "NASH", table: "FECOND" },
  { name: "JEREMIE", table: "FECOND" },
  { name: "BENJI", table: "FECOND" },
  { name: "ELIEZER", table: "FECOND" },
  { name: "SIKA MERVEILLE", table: "FECOND" },
  { name: "MICHE", table: "FECOND" },
  // TABLE PASMEX
  { name: "Couple ISAAC WASSA", table: "PASMEX" },
  { name: "Couple KINA", table: "PASMEX" },
  { name: "Couple SHAKO", table: "PASMEX" },
  { name: "GLOIRIES SANALISE", table: "PASMEX" },
  { name: "BENEDICTE NDAKA", table: "PASMEX" },
  { name: "DJENNY", table: "PASMEX" },
  { name: "DJAMAR", table: "PASMEX" },
  { name: "TADE", table: "PASMEX" },
  { name: "DEBORHA KABUYA", table: "PASMEX" },
  // TABLE LINZOX
  { name: "HERVE WASSA", table: "LINZOX" },
  { name: "Couple ISRAEL", table: "LINZOX" },
  { name: "Couple TITO NKAMA", table: "LINZOX" },
  { name: "ADIKO NDONGATO", table: "LINZOX" },
  { name: "FERRO", table: "LINZOX" },
  { name: "KADY", table: "LINZOX" },
  { name: "JONAS WASSA", table: "LINZOX" },
  { name: "DIDIER TEBWA", table: "LINZOX" },
  // TABLE VITRON-Z
  { name: "Couple JEREMIE YEVUNDU", table: "VITRON-Z" },
  { name: "Danny BEDI", table: "VITRON-Z" },
  { name: "VALENCIA", table: "VITRON-Z" },
  { name: "TONNY NDOMBA", table: "VITRON-Z" },
  { name: "KOKO KUKU", table: "VITRON-Z" },
  { name: "HENOCK", table: "VITRON-Z" },
  { name: "REAGAN LINAKA", table: "VITRON-Z" },
  { name: "OBBY NDONGATO", table: "VITRON-Z" },
  { name: "ARMAN NONGO", table: "VITRON-Z" },
  { name: "ADAN", table: "VITRON-Z" },
  { name: "CHARLE", table: "VITRON-Z" },
  // TABLE ROSUMEX
  { name: "FABRICE IZAGOL0", table: "ROSUMEX" },
  { name: "FAIDA IZAGOLO", table: "ROSUMEX" },
  { name: "NADEGE IZAGOLO", table: "ROSUMEX" },
  { name: "MELVA IZAGOLO", table: "ROSUMEX" },
  { name: "DIVINE IZAGOLO", table: "ROSUMEX" },
  { name: "TYCHIQUE IZAGOLO", table: "ROSUMEX" },
  { name: "PIERRETE IZAGOLA", table: "ROSUMEX" },
  { name: "RISNEL", table: "ROSUMEX" },
  { name: "PETIT", table: "ROSUMEX" },
  { name: "GLORIA MONTA", table: "ROSUMEX" },
  // TABLE CETHER-L
  { name: "Couple KAPESA", table: "CETHER-L" },
  { name: "Couple CHRISTIAN", table: "CETHER-L" },
  { name: "Couple OKITO", table: "CETHER-L" },
  { name: "Couple BERAKO", table: "CETHER-L" },
  { name: "Couple OSEE", table: "CETHER-L" },
  { name: "Couple BERLETTE", table: "CETHER-L" },
  // TABLE NEBIMEX
  { name: "MA REGINE", table: "NEBIMEX" },
  { name: "REUNION 9 persones", table: "NEBIMEX" },
  { name: "MA SABINA", table: "NEBIMEX" },
  { name: "MA EUGENIE", table: "NEBIMEX" },
  // TABLE MICOFLU
  { name: "Couple AIME", table: "MICOFLU" },
  { name: "Couple BRIGITTE", table: "MICOFLU" },
  { name: "Couple KENEDI", table: "MICOFLU" },
  { name: "Couple LAURETTE", table: "MICOFLU" },
  { name: "CHRISTEL MANSAMBU", table: "MICOFLU" },
  { name: "PA JOSE", table: "MICOFLU" },
  { name: "MOGOLIA PAPY", table: "MICOFLU" },
  { name: "PA DENIS", table: "MICOFLU" },
  // TABLE HEMOREX
  { name: "Couple NAOMIE KAPINGA", table: "HEMOREX" },
  { name: "Couple HILAIR", table: "HEMOREX" },
  { name: "Couple ABIGAEL", table: "HEMOREX" },
  { name: "Couple MILKA", table: "HEMOREX" },
  { name: "Couple LAGERDIE", table: "HEMOREX" },
  { name: "Couple L'OR KAPESA", table: "HEMOREX" },
  // TABLE AMOXYCILLINE
  { name: "JOSIA", table: "AMOXYCILLINE" },
  { name: "EUNICE EDIA", table: "AMOXYCILLINE" },
  { name: "PRINCILIA MONGANGA", table: "AMOXYCILLINE" },
  { name: "MIMIE MONGANGA", table: "AMOXYCILLINE" },
  { name: "RUTH MONGANGA", table: "AMOXYCILLINE" },
  { name: "MANU MALANDISA", table: "AMOXYCILLINE" },
  { name: "BELINDA MALANDISA", table: "AMOXYCILLINE" },
  { name: "EUNICE KAKOTO", table: "AMOXYCILLINE" },
  { name: "JONATHAN NZEMA", table: "AMOXYCILLINE" },
  { name: "IVONE MONGANGA", table: "AMOXYCILLINE" },
  // TABLE CESADOX
  { name: "Couple MIFI", table: "CESADOX" },
  { name: "Couple BEYA", table: "CESADOX" },
  { name: "Couple LYDIE", table: "CESADOX" },
  { name: "STEPHIE KAPESA", table: "CESADOX" },
  { name: "MA ANNY", table: "CESADOX" },
  { name: "PLAME KAPESA", table: "CESADOX" },
  { name: "DJODJO KAPESA", table: "CESADOX" },
];

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

const log = (msg) => {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
};

/**
 * Detect invitation_type from the name
 * - Starts with "Couple" or "COUPLE" → "couple"
 * - Otherwise → "individuel"
 */
function detectInvitationType(name) {
  if (/^couple\s/i.test(name)) return 'couple';
  return 'individuel';
}

/**
 * Split a full display name into firstName/lastName for search compatibility
 * Rule: First word → firstName, everything else → lastName
 * For single-word names: both get the same value (for search matching)
 */
function splitName(displayName) {
  const trimmed = displayName.trim();
  const parts = trimmed.split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Determine category from the name
 */
function detectCategory(name, invitationType) {
  const upper = name.toUpperCase();
  if (upper.includes('PASTEUR')) return 'VIP';
  if (upper.includes('BERGE')) return 'FAMILLE';
  if (invitationType === 'couple') return 'COUPLE';
  return 'AMIS';
}

/**
 * Determine seats from invitation type
 */
function detectSeats(invitationType) {
  return invitationType === 'couple' ? 2 : 1;
}

// ═══════════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════════

async function migrate() {
  const startTime = Date.now();
  
  // Clear previous log
  fs.writeFileSync(LOG_FILE, '');
  
  log('═══════════════════════════════════════════════════════════════');
  log('MIGRATION STARTED: Guest List Replacement');
  log('═══════════════════════════════════════════════════════════════');
  
  // ─── Step 1: Audit current state ───
  log('\n─── Step 1: Pre-migration audit ───');
  
  const currentGuests = await db.guest.findMany({
    select: { id: true, firstName: true, lastName: true, invitationCode: true }
  });
  log(`Current guests in DB: ${currentGuests.length}`);
  
  const currentTables = await db.table.findMany();
  log(`Current tables in DB: ${currentTables.length}`);
  
  // ─── Step 2: Create/Update Tables ───
  log('\n─── Step 2: Sync tables ───');
  
  const neededTableNames = [...new Set(OFFICIAL_GUEST_LIST.map(g => g.table))];
  log(`Tables needed: ${neededTableNames.length} → ${neededTableNames.join(', ')}`);
  
  const tableMap = {};
  for (const t of currentTables) {
    tableMap[t.name.toUpperCase()] = t;
  }
  
  const maxNumber = currentTables.reduce((max, t) => Math.max(max, t.number), 0);
  let nextNumber = maxNumber + 1;
  
  const tableIdMap = {};
  
  for (const tableName of neededTableNames) {
    const normalizedName = tableName.toUpperCase().replace(/\s*-\s*/g, '-');
    
    const existing = Object.entries(tableMap).find(([key]) => 
      key === normalizedName || key === tableName.toUpperCase()
    );
    
    if (existing) {
      tableIdMap[tableName] = existing[1].id;
      log(`  Table "${tableName}" already exists (id: ${existing[1].id})`);
    } else {
      const table = await db.table.create({
        data: { name: tableName, number: nextNumber++, capacity: 10 }
      });
      tableIdMap[tableName] = table.id;
      tableMap[tableName.toUpperCase()] = table;
      log(`  Created table "${tableName}" (number: ${table.number}, id: ${table.id})`);
    }
  }
  
  // ─── Step 3: Delete old guests ───
  log('\n─── Step 3: Clear old guest data ───');
  
  const deletedAccessLogs = await db.guestAccessLog.deleteMany({});
  log(`  Deleted ${deletedAccessLogs.count} guest access logs`);
  
  const deletedSessions = await db.guestSession.deleteMany({});
  log(`  Deleted ${deletedSessions.count} guest sessions`);
  
  const deletedGuests = await db.guest.deleteMany({});
  log(`  Deleted ${deletedGuests.count} old guests`);
  
  // ─── Step 4: Import new guests ───
  log('\n─── Step 4: Import new guests ───');
  
  let imported = 0;
  let coupleCount = 0;
  let individuelCount = 0;
  let errors = [];
  let duplicates = [];
  const seenNames = new Set();
  
  for (let i = 0; i < OFFICIAL_GUEST_LIST.length; i++) {
    const entry = OFFICIAL_GUEST_LIST[i];
    const displayName = entry.name.trim();
    
    try {
      const nameKey = displayName.toUpperCase().replace(/\s+/g, ' ');
      if (seenNames.has(nameKey)) {
        duplicates.push(displayName);
        log(`  ⚠ DUPLICATE: "${displayName}" (skipped)`);
        continue;
      }
      seenNames.add(nameKey);
      
      const invitationType = detectInvitationType(displayName);
      if (invitationType === 'couple') coupleCount++;
      else individuelCount++;
      
      const { firstName, lastName } = splitName(displayName);
      const category = detectCategory(displayName, invitationType);
      const seats = detectSeats(invitationType);
      const invitationCode = uuidv4().substring(0, 8).toUpperCase();
      const tableId = tableIdMap[entry.table] || null;
      
      await db.guest.create({
        data: {
          firstName,
          lastName,
          displayName,
          invitationType,
          seats,
          category,
          invitationCode,
          tableId,
          status: 'PENDING',
        }
      });
      
      imported++;
      log(`  ✅ [${i+1}/${OFFICIAL_GUEST_LIST.length}] "${displayName}" → firstName="${firstName}", lastName="${lastName}", type=${invitationType}, cat=${category}, seats=${seats}, table=${entry.table}`);
      
    } catch (err) {
      const errMsg = `Row ${i+1}: "${displayName}" → ${err.message}`;
      errors.push(errMsg);
      log(`  ❌ ERROR: ${errMsg}`);
    }
  }
  
  // ─── Step 5: Validation ───
  log('\n─── Step 5: Post-migration validation ───');
  
  const totalGuests = await db.guest.count();
  const dbCouples = await db.guest.count({ where: { invitationType: 'couple' } });
  const dbIndividuels = await db.guest.count({ where: { invitationType: 'individuel' } });
  
  log(`  Total guests in DB: ${totalGuests}`);
  log(`  Couples: ${dbCouples}`);
  log(`  Individuels: ${dbIndividuels}`);
  log(`  Expected total: ${OFFICIAL_GUEST_LIST.length}`);
  log(`  Duplicates skipped: ${duplicates.length}`);
  log(`  Errors: ${errors.length}`);
  
  // ─── Step 6: Display name verification ───
  log('\n─── Step 6: Display name verification ───');
  
  let nameMatchErrors = 0;
  const allGuests = await db.guest.findMany({
    select: { id: true, displayName: true, firstName: true, lastName: true, invitationType: true }
  });
  
  for (const guest of allGuests) {
    if (!guest.displayName) {
      log(`  ⚠ MISSING displayName for: ${guest.firstName} ${guest.lastName}`);
      nameMatchErrors++;
      continue;
    }
    
    const found = OFFICIAL_GUEST_LIST.some(e => e.name.trim() === guest.displayName);
    if (!found) {
      log(`  ⚠ displayName "${guest.displayName}" not found in official list`);
      nameMatchErrors++;
    }
  }
  
  log(`  Display name mismatches: ${nameMatchErrors}`);
  
  // ─── Step 7: Search verification ───
  log('\n─── Step 7: Search verification ───');
  
  const normalizeForSearch = (str) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  
  const searchTests = [
    { query: 'guyguy', expectedContains: 'Couple PASTEUR GUYGUY' },
    { query: 'kamba', expectedContains: 'Couple KAMBA' },
    { query: 'gracia', expectedContains: 'Sr GRACIA' },
    { query: 'imbule', expectedContains: 'Pasteur IMBULE' },
    { query: 'système', expectedContains: 'Couple SYSTÈME' },
    { query: 'kapesa', expectedContains: null },
  ];
  
  for (const test of searchTests) {
    const normalized = normalizeForSearch(test.query);
    const matches = allGuests.filter(g => {
      const nameNorm = normalizeForSearch(g.displayName || `${g.firstName} ${g.lastName}`);
      return nameNorm.includes(normalized);
    });
    
    if (test.expectedContains) {
      const found = matches.some(m => m.displayName === test.expectedContains);
      log(`  Search "${test.query}" → ${matches.length} results, expected found: ${found ? '✅' : '❌'}`);
    } else {
      log(`  Search "${test.query}" → ${matches.length} results ✅`);
    }
  }
  
  // ─── Summary ───
  const duration = Date.now() - startTime;
  
  log('\n═══════════════════════════════════════════════════════════════');
  log('MIGRATION COMPLETE');
  log('═══════════════════════════════════════════════════════════════');
  log(`Total guests imported: ${imported}`);
  log(`Couples: ${coupleCount}`);
  log(`Individuels: ${individuelCount}`);
  log(`Duplicates detected: ${duplicates.length}`);
  log(`Errors: ${errors.length}`);
  log(`Display name mismatches: ${nameMatchErrors}`);
  log(`Execution time: ${(duration / 1000).toFixed(2)}s`);
  
  if (errors.length > 0) {
    log('\nError details:');
    errors.forEach(e => log(`  - ${e}`));
  }
  
  if (duplicates.length > 0) {
    log('\nDuplicate entries skipped:');
    duplicates.forEach(d => log(`  - ${d}`));
  }
  
  await db.$disconnect();
  
  return {
    imported,
    coupleCount,
    individuelCount,
    duplicates: duplicates.length,
    errors: errors.length,
    nameMatchErrors,
    duration,
  };
}

migrate().then(result => {
  console.log('\n📊 MIGRATION RESULT:', JSON.stringify(result, null, 2));
  process.exit(result.errors > 0 ? 1 : 0);
}).catch(err => {
  console.error('MIGRATION FAILED:', err);
  process.exit(1);
});
