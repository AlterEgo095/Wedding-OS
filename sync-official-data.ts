/**
 * SYNCHRONISATION OFFICIELLE DE LA BASE DE DONNÉES
 * 
 * Ce script synchronise la base de données avec la liste officielle des 31 tables
 * et leurs invités. Il NE modifie aucun fichier frontend/backend/API.
 * 
 * Opérations :
 * 1. Renommer/renuméroter les tables selon la liste officielle
 * 2. Supprimer les tables en trop (CESAKROL II, MAXSPRIN)
 * 3. Ajouter les invités manquants
 * 4. Corriger les erreurs d'orthographe
 * 5. Mettre à jour les capacités des tables
 */

import { db } from './src/lib/db';
import crypto from 'crypto';

function generateInvitationCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  return `cm${timestamp}${random.slice(0, 20)}`;
}

async function main() {
  console.log('=================================================');
  console.log('  SYNCHRONISATION OFFICIELLE DE LA BASE DE DONNÉES');
  console.log('=================================================\n');

  // ==========================================
  // PHASE 1: AUDIT - État actuel
  // ==========================================
  console.log('📋 PHASE 1: AUDIT DE L\'ÉTAT ACTUEL\n');

  const currentTables = await db.table.findMany({
    orderBy: { number: 'asc' },
    include: { guests: true },
  });

  const currentGuests = await db.guest.findMany();
  console.log(`  Tables actuelles: ${currentTables.length}`);
  console.log(`  Invités actuels: ${currentGuests.length}`);

  // ==========================================
  // PHASE 2: MAPPING DES TABLES
  // ==========================================
  console.log('\n📋 PHASE 2: MAPPING DES TABLES (DB → OFFICIEL)\n');

  // Official table list: number -> name
  const officialTables: Record<number, string> = {
    1: 'ANSET',
    2: 'CEMYCINE',
    3: 'CESACAL',
    4: 'CEPIME',
    5: 'NORMEGYL',
    6: 'SECTAB',
    7: 'ESOMEX',
    8: 'CEFAM',
    9: 'VOGLITUS',
    10: 'CESAKROL',
    11: 'TELSOTON',
    12: 'DICLOFENAC',
    13: 'APHEROL',
    14: 'PARACETAMOL',
    15: 'DIGEST',
    16: 'DEZOLIN',
    17: 'CITRIMEX-DT',
    18: 'CEFUROCLAV',
    19: 'NICAR',
    20: 'TRACOL',
    21: 'FECOND',
    22: 'PASMEX',
    23: 'LINZOX',
    24: 'VITRON-Z',
    25: 'ROSUMEX',
    26: 'CETHER-L',
    27: 'NEBIMEX',
    28: 'MICOFLU',
    29: 'HEMOREX',
    30: 'AMOXYCILLINE',
    31: 'CESADOX',
  };

  // Map: official table name → official number
  const nameToOfficialNumber: Record<string, number> = {};
  for (const [num, name] of Object.entries(officialTables)) {
    nameToOfficialNumber[name] = parseInt(num);
  }

  // Map: current DB table name → table record
  const nameToCurrentTable: Record<string, typeof currentTables[0]> = {};
  for (const t of currentTables) {
    nameToCurrentTable[t.name] = t;
  }

  // Build the mapping: current table ID → new official number
  const tableRenumMap: Record<string, number> = {};
  const tablesToDelete: string[] = [];
  const changes: string[] = [];

  for (const t of currentTables) {
    if (nameToOfficialNumber[t.name] !== undefined) {
      const newNum = nameToOfficialNumber[t.name];
      tableRenumMap[t.id] = newNum;
      if (t.number !== newNum) {
        changes.push(`Table "${t.name}": #${t.number} → #${newNum}`);
      }
    } else {
      // Table not in official list → delete
      tablesToDelete.push(t.id);
      changes.push(`Table "${t.name}" (#${t.number}): SUPPRIMÉE (${t.guests.length} invités affectés)`);
    }
  }

  for (const c of changes) {
    console.log(`  🔄 ${c}`);
  }
  console.log(`\n  Tables à supprimer: ${tablesToDelete.length}`);

  // ==========================================
  // PHASE 3: RENUMÉROTATION DES TABLES
  // ==========================================
  console.log('\n📋 PHASE 3: RENUMÉROTATION DES TABLES\n');

  // Step 3a: Move all table numbers to temporary values (avoid unique constraint)
  console.log('  Étape 3a: Assignation de numéros temporaires...');
  for (const t of currentTables) {
    await db.table.update({
      where: { id: t.id },
      data: { number: t.number + 100 },
    });
    console.log(`  ✓ ${t.name}: #${t.number} → temp #${t.number + 100}`);
  }

  // Step 3b: Set official numbers
  console.log('\n  Étape 3b: Assignation des numéros officiels...');
  for (const [tableId, newNum] of Object.entries(tableRenumMap)) {
    const table = currentTables.find(t => t.id === tableId);
    const tableName = table?.name || 'Unknown';
    await db.table.update({
      where: { id: tableId },
      data: { number: newNum },
    });
    console.log(`  ✓ ${tableName} → #${newNum}`);
  }

  // Step 3c: Delete extra tables
  console.log('\n  Étape 3c: Suppression des tables en trop...');
  for (const tableId of tablesToDelete) {
    const table = currentTables.find(t => t.id === tableId);
    // First, set all guests from this table to null tableId
    await db.guest.updateMany({
      where: { tableId: tableId },
      data: { tableId: null },
    });
    await db.table.delete({
      where: { id: tableId },
    });
    console.log(`  ✓ Supprimée: ${table?.name} (#${table?.number})`);
  }

  // ==========================================
  // PHASE 4: CORRECTION DES NOMS D'INVITÉS
  // ==========================================
  console.log('\n📋 PHASE 4: CORRECTIONS D\'ORTHOGRAPHE\n');

  const spellingFixes: Array<{ id: string; field: 'firstName' | 'lastName' | 'displayName'; oldVal: string; newVal: string }> = [];

  // Find "REUNION 9 persones" → should be "REUNION 9 personnes"
  const reunionGuest = currentGuests.find(g => g.displayName?.includes('REUNION 9 person'));
  if (reunionGuest && !reunionGuest.displayName?.includes('personnes')) {
    spellingFixes.push(
      { id: reunionGuest.id, field: 'firstName', oldVal: reunionGuest.firstName, newVal: 'REUNION 9 personnes' },
      { id: reunionGuest.id, field: 'lastName', oldVal: reunionGuest.lastName, newVal: 'REUNION 9 personnes' },
      { id: reunionGuest.id, field: 'displayName', oldVal: reunionGuest.displayName || '', newVal: 'REUNION 9 personnes' },
    );
  }

  // Find "FABRICE IZAGOL0" (with zero) → should be "FABRICE IZAGOLO" (with O)
  const fabriceGuest = currentGuests.find(g => g.displayName?.includes('IZAGOL0'));
  if (fabriceGuest) {
    spellingFixes.push(
      { id: fabriceGuest.id, field: 'firstName', oldVal: fabriceGuest.firstName, newVal: 'FABRICE IZAGOLO' },
      { id: fabriceGuest.id, field: 'lastName', oldVal: fabriceGuest.lastName, newVal: 'FABRICE IZAGOLO' },
      { id: fabriceGuest.id, field: 'displayName', oldVal: fabriceGuest.displayName || '', newVal: 'FABRICE IZAGOLO' },
    );
  }

  // Apply spelling fixes
  for (const fix of spellingFixes) {
    await db.guest.update({
      where: { id: fix.id },
      data: { [fix.field]: fix.newVal },
    });
    console.log(`  ✓ Corrigé: "${fix.oldVal}" → "${fix.newVal}" (${fix.field})`);
  }

  // ==========================================
  // PHASE 5: AJOUT DES INVITÉS MANQUANTS
  // ==========================================
  console.log('\n📋 PHASE 5: AJOUT DES INVITÉS MANQUANTS\n');

  // Check which guests are in the official list but missing from DB
  // Official list per table
  const officialGuests: Record<string, Array<{ name: string; isCouple: boolean; category: string }>> = {
    'ANSET': [
      { name: 'Couple PASTEUR GUYGUY', isCouple: true, category: 'VIP' },
      { name: 'Couple Pasteur PECHO', isCouple: true, category: 'VIP' },
      { name: 'Couple Berge MUSEMA', isCouple: true, category: 'FAMILLE' },
      { name: 'Couple Berge KALO', isCouple: true, category: 'FAMILLE' },
      { name: 'Couple TANTE MAGUY', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KALO', isCouple: true, category: 'COUPLE' },
    ],
    'CEMYCINE': [
      { name: 'Couple PAUL', isCouple: true, category: 'COUPLE' },
      { name: 'Pasteur IMBULE', isCouple: false, category: 'VIP' },
      { name: 'Ma MARIE JEANE', isCouple: false, category: 'AMIS' },
      { name: 'Couple Pa MICHEL', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MARC', isCouple: true, category: 'COUPLE' },
      { name: 'Sr GRACIA', isCouple: false, category: 'AMIS' },
      { name: 'Ma CHANTAL DJONGA', isCouple: false, category: 'AMIS' },
      { name: 'Couple PARAIN', isCouple: true, category: 'COUPLE' },
    ],
    'CESACAL': [
      { name: 'Couple NEHEMIE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple Fr GUELORD', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MOTENDA', isCouple: true, category: 'COUPLE' },
      { name: 'Sr DEBORHA ILUNGA', isCouple: false, category: 'AMIS' },
      { name: 'Sr GIVE ILUNGA', isCouple: false, category: 'AMIS' },
      { name: 'PRISCA ILUNGA', isCouple: false, category: 'AMIS' },
      { name: 'Ma ONO', isCouple: false, category: 'AMIS' },
    ],
    'CEPIME': [
      { name: 'Couple KAMBA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BOB', isCouple: true, category: 'COUPLE' },
      { name: 'GUSLAINE', isCouple: false, category: 'AMIS' },
      { name: 'DEBORHA', isCouple: false, category: 'AMIS' },
      { name: 'DJENNY MBONGE', isCouple: false, category: 'AMIS' },
      { name: 'ATOCHA SARAH', isCouple: false, category: 'AMIS' },
      { name: 'Couple MUNGUANZI', isCouple: true, category: 'COUPLE' },
      { name: 'KAPINGA ANNIE', isCouple: false, category: 'AMIS' },
      { name: 'SEYA', isCouple: false, category: 'AMIS' },
    ],
    'NORMEGYL': [
      { name: 'Couple MBELE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MPUTU', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BILU', isCouple: true, category: 'COUPLE' },
      { name: 'DJODJO', isCouple: false, category: 'AMIS' },
      { name: 'Couple HERNANDEZ', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MATANDA', isCouple: true, category: 'COUPLE' },
    ],
    'SECTAB': [
      { name: 'Couple MOMPOLE HUMAINE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MWANZA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple VERRO', isCouple: true, category: 'COUPLE' },
      { name: 'CHRISTEL', isCouple: false, category: 'AMIS' },
      { name: 'Ma FRANCOISE', isCouple: false, category: 'AMIS' },
      { name: 'Ma DANIELA', isCouple: false, category: 'AMIS' },
      { name: 'RAISA', isCouple: false, category: 'AMIS' },
      { name: 'Dr DIKENS', isCouple: false, category: 'AMIS' },
      { name: 'ARLON', isCouple: false, category: 'AMIS' },
    ],
    'ESOMEX': [
      { name: 'FRANCK WASSA', isCouple: false, category: 'AMIS' },
      { name: 'Couple V HUGO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple GUELOR BIDE', isCouple: true, category: 'COUPLE' },
      { name: 'JOSELINE WASSA', isCouple: false, category: 'AMIS' },
      { name: 'ODETTE', isCouple: false, category: 'AMIS' },
      { name: 'KIKI', isCouple: false, category: 'AMIS' },
      { name: 'TANTE NELLY', isCouple: false, category: 'AMIS' },
      { name: 'Ma JACQUIE', isCouple: false, category: 'AMIS' },
    ],
    'CEFAM': [
      { name: 'Couple ABANI', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KALAMBAYI', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MBELE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple IZUELE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BENA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KIFATA', isCouple: true, category: 'COUPLE' },
    ],
    'VOGLITUS': [
      { name: 'BERNADETTE', isCouple: false, category: 'AMIS' },
      { name: 'Couple SOLANGE', isCouple: true, category: 'COUPLE' },
      { name: 'ELIEL', isCouple: false, category: 'AMIS' },
      { name: 'ARISTOTE ABANI', isCouple: false, category: 'AMIS' },
      { name: 'SANDRA', isCouple: false, category: 'AMIS' },
      { name: 'PAMELA', isCouple: false, category: 'AMIS' },
      { name: 'FRANKLIN', isCouple: false, category: 'AMIS' },
      { name: 'LUMIERE', isCouple: false, category: 'AMIS' },
      { name: 'BABY', isCouple: false, category: 'AMIS' },
      { name: 'GRACE', isCouple: false, category: 'AMIS' },
    ],
    'CESAKROL': [
      { name: 'Couple MAGUY LIBAZA', isCouple: true, category: 'COUPLE' },
      { name: 'ELMA LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'THETHE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'Couple NYALO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple WEMBA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MEYA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MOTELU CLARIS', isCouple: true, category: 'COUPLE' },
    ],
    'TELSOTON': [
      { name: 'Couple FABRICE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple GLODY', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KYRIA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MIREIL', isCouple: true, category: 'COUPLE' },
      { name: 'Couple ANTHO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple FLORIDA', isCouple: true, category: 'COUPLE' },
    ],
    'DICLOFENAC': [
      { name: 'RACHEL LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'REAGAN MPEMPE', isCouple: false, category: 'AMIS' },
      { name: 'NORNA LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'ZACKARIE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'JOSUE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'ELIE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'CHRISTEVIE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'CLEMENCE LIBAZA', isCouple: false, category: 'AMIS' },
      { name: 'Couple CATHY', isCouple: true, category: 'COUPLE' },
      { name: 'AIMERDIE', isCouple: false, category: 'AMIS' },
      { name: 'MBUYI ELI', isCouple: false, category: 'AMIS' },
    ],
    'APHEROL': [
      { name: 'Couple HILDA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple LUKA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MULAYI', isCouple: true, category: 'COUPLE' },
      { name: 'Couple NGANGO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple JEREDART', isCouple: true, category: 'COUPLE' },
    ],
    'PARACETAMOL': [
      { name: 'UNIQUE', isCouple: false, category: 'AMIS' },
      { name: 'GABAHEL GLOIRE LUZOLANU', isCouple: false, category: 'AMIS' },
      { name: 'PRINCE PHARMA', isCouple: false, category: 'AMIS' },
      { name: 'CAISSA', isCouple: false, category: 'AMIS' },
      { name: 'NEWS CESAMEX', isCouple: false, category: 'AMIS' },
      { name: 'INF PAPY', isCouple: false, category: 'AMIS' },
      { name: 'ELIE JOSEPH', isCouple: false, category: 'AMIS' },
      { name: 'INFIRMIERES CARINE', isCouple: false, category: 'AMIS' },
      { name: 'Couple P ROSSY MANDULU', isCouple: true, category: 'COUPLE' },
    ],
    'DIGEST': [
      { name: 'Couple BUMBA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BAVON MBELE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple HUGUETTE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple FELLY', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MBOYO', isCouple: true, category: 'COUPLE' },
    ],
    'DEZOLIN': [
      { name: 'Couple SERAPHIN', isCouple: true, category: 'COUPLE' },
      { name: 'Couple GUYAUME', isCouple: true, category: 'COUPLE' },
      { name: 'Couple CEDRICK', isCouple: true, category: 'COUPLE' },
      { name: 'Couple PELAGIE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple IRENE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple JUDITH', isCouple: true, category: 'COUPLE' },
    ],
    'CITRIMEX-DT': [
      { name: 'Couple NZILA MATONDO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple ELVICE KOYALA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple JOEL MALUNDA', isCouple: true, category: 'COUPLE' },
      { name: 'BEN MUZOMWE', isCouple: false, category: 'AMIS' },
      { name: 'ISAAC NGWANZO', isCouple: false, category: 'AMIS' },
      { name: 'NICKSON DONGO', isCouple: false, category: 'AMIS' },
      { name: 'VINNY BENDE', isCouple: false, category: 'AMIS' },
      { name: 'FRANCY MOKOLI', isCouple: false, category: 'AMIS' },
      { name: 'GLODY MASANDI', isCouple: false, category: 'AMIS' },
    ],
    'CEFUROCLAV': [
      { name: 'Couple DADA', isCouple: true, category: 'COUPLE' },
      { name: 'OSEE BOPUPA', isCouple: false, category: 'AMIS' },
      { name: 'BENI BODIKO', isCouple: false, category: 'AMIS' },
      { name: 'JONATHAN NZOBALE', isCouple: false, category: 'AMIS' },
      { name: 'MOISE LUKOMBO', isCouple: false, category: 'AMIS' },
      { name: 'DAVID MANYA', isCouple: false, category: 'AMIS' },
      { name: 'DJENNY KISALU', isCouple: false, category: 'AMIS' },
      { name: 'Sr LISETTE', isCouple: false, category: 'AMIS' },
      { name: 'NADEGE BODIKO', isCouple: false, category: 'AMIS' },
    ],
    'NICAR': [
      { name: 'PLATINI KAKILA', isCouple: false, category: 'AMIS' },
      { name: 'JOSE MPAKA', isCouple: false, category: 'AMIS' },
      { name: 'YELENGE', isCouple: false, category: 'AMIS' },
      { name: 'SERA MANDEFU', isCouple: false, category: 'AMIS' },
      { name: 'CADETTE SUNDA', isCouple: false, category: 'AMIS' },
      { name: 'Fr MEDIO', isCouple: false, category: 'AMIS' },
      { name: 'GIRESSE ZIRI', isCouple: false, category: 'AMIS' },
      { name: 'Couple MAKWELA', isCouple: true, category: 'COUPLE' },
      { name: 'ANDY LIMBA', isCouple: false, category: 'AMIS' },
      { name: 'JACK LEMBI', isCouple: false, category: 'AMIS' },
      { name: 'ANNO MAYEMBO', isCouple: false, category: 'AMIS' },
    ],
    'TRACOL': [
      { name: 'Couple BLAISE DONGO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple DJYMMY', isCouple: true, category: 'COUPLE' },
      { name: 'Couple SYSTÈME', isCouple: true, category: 'COUPLE' },
      { name: 'ALBERT KANDOLO', isCouple: false, category: 'AMIS' },
      { name: 'Mrs HIPPOLITE', isCouple: false, category: 'AMIS' },
      { name: 'Couple KAZADI', isCouple: true, category: 'COUPLE' },
    ],
    'FECOND': [
      { name: 'Couple MVITA', isCouple: true, category: 'COUPLE' },
      { name: 'SHAROWN', isCouple: false, category: 'AMIS' },
      { name: 'MALACHIE', isCouple: false, category: 'AMIS' },
      { name: 'WISLET', isCouple: false, category: 'AMIS' },
      { name: 'KASEMA', isCouple: false, category: 'AMIS' },
      { name: 'NASH', isCouple: false, category: 'AMIS' },
      { name: 'JEREMIE', isCouple: false, category: 'AMIS' },
      { name: 'BENJI', isCouple: false, category: 'AMIS' },
      { name: 'ELIEZER', isCouple: false, category: 'AMIS' },
      { name: 'SIKA MERVEILLE', isCouple: false, category: 'AMIS' },
      { name: 'MICHE', isCouple: false, category: 'AMIS' },
    ],
    'PASMEX': [
      { name: 'Couple ISAAC WASSA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KINA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple SHAKO', isCouple: true, category: 'COUPLE' },
      { name: 'GLOIRIES SANALISE', isCouple: false, category: 'AMIS' },
      { name: 'BENEDICTE NDAKA', isCouple: false, category: 'AMIS' },
      { name: 'DJENNY', isCouple: false, category: 'AMIS' },
      { name: 'DJAMAR', isCouple: false, category: 'AMIS' },
      { name: 'TADE', isCouple: false, category: 'AMIS' },
      { name: 'DEBORHA KABUYA', isCouple: false, category: 'AMIS' },
    ],
    'LINZOX': [
      { name: 'HERVE WASSA', isCouple: false, category: 'AMIS' },
      { name: 'Couple ISRAEL', isCouple: true, category: 'COUPLE' },
      { name: 'Couple TITO NKAMA', isCouple: true, category: 'COUPLE' },
      { name: 'ADIKO NDONGATO', isCouple: false, category: 'AMIS' },
      { name: 'FERRO', isCouple: false, category: 'AMIS' },
      { name: 'KADY', isCouple: false, category: 'AMIS' },
      { name: 'JONAS WASSA', isCouple: false, category: 'AMIS' },
      { name: 'DIDIER TEBWA', isCouple: false, category: 'AMIS' },
    ],
    'VITRON-Z': [
      { name: 'Couple JEREMIE YEVUNDU', isCouple: true, category: 'COUPLE' },
      { name: 'Danny BEDI', isCouple: false, category: 'AMIS' },
      { name: 'VALENCIA', isCouple: false, category: 'AMIS' },
      { name: 'TONNY NDOMBA', isCouple: false, category: 'AMIS' },
      { name: 'KOKO KUKU', isCouple: false, category: 'AMIS' },
      { name: 'HENOCK', isCouple: false, category: 'AMIS' },
      { name: 'REAGAN LINAKA', isCouple: false, category: 'AMIS' },
      { name: 'OBBY NDONGATO', isCouple: false, category: 'AMIS' },
      { name: 'ARMAN NONGO', isCouple: false, category: 'AMIS' },
      { name: 'ADAN', isCouple: false, category: 'AMIS' },
      { name: 'CHARLE', isCouple: false, category: 'AMIS' },
    ],
    'ROSUMEX': [
      { name: 'FABRICE IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'FAIDA IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'NADEGE IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'MELVA IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'DIVINE IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'TYCHIQUE IZAGOLO', isCouple: false, category: 'AMIS' },
      { name: 'PIERRETE IZAGOLA', isCouple: false, category: 'AMIS' },
      { name: 'RISNEL', isCouple: false, category: 'AMIS' },
      { name: 'PETIT', isCouple: false, category: 'AMIS' },
      { name: 'GLORIA MONTA', isCouple: false, category: 'AMIS' },
    ],
    'CETHER-L': [
      { name: 'Couple KAPESA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple CHRISTIAN', isCouple: true, category: 'COUPLE' },
      { name: 'Couple OKITO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BERAKO', isCouple: true, category: 'COUPLE' },
      { name: 'Couple OSEE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BERLETTE', isCouple: true, category: 'COUPLE' },
    ],
    'NEBIMEX': [
      { name: 'Ma REGINE', isCouple: false, category: 'AMIS' },
      { name: 'REUNION 9 personnes', isCouple: false, category: 'AMIS' },
      { name: 'Ma SABINA', isCouple: false, category: 'AMIS' },
      { name: 'Ma EUGENIE', isCouple: false, category: 'AMIS' },
    ],
    'MICOFLU': [
      { name: 'Couple AIME', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BRIGITTE', isCouple: true, category: 'COUPLE' },
      { name: 'Couple KENEDI', isCouple: true, category: 'COUPLE' },
      { name: 'Couple LAURETTE', isCouple: true, category: 'COUPLE' },
      { name: 'CHRISTEL MANSAMBU', isCouple: false, category: 'AMIS' },
      { name: 'Pa JOSE', isCouple: false, category: 'AMIS' },
      { name: 'MOGOLIA PAPY', isCouple: false, category: 'AMIS' },
      { name: 'Pa DENIS', isCouple: false, category: 'AMIS' },
    ],
    'HEMOREX': [
      { name: 'Couple NAOMIE KAPINGA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple HILAIR', isCouple: true, category: 'COUPLE' },
      { name: 'Couple ABIGAEL', isCouple: true, category: 'COUPLE' },
      { name: 'Couple MILKA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple LAGERDIE', isCouple: true, category: 'COUPLE' },
      { name: "Couple L'OR KAPESA", isCouple: true, category: 'COUPLE' },
    ],
    'AMOXYCILLINE': [
      { name: 'JOSIA', isCouple: false, category: 'AMIS' },
      { name: 'EUNICE EDIA', isCouple: false, category: 'AMIS' },
      { name: 'PRINCILIA MONGANGA', isCouple: false, category: 'AMIS' },
      { name: 'MIMIE MONGANGA', isCouple: false, category: 'AMIS' },
      { name: 'RUTH MONGANGA', isCouple: false, category: 'AMIS' },
      { name: 'MANU MALANDISA', isCouple: false, category: 'AMIS' },
      { name: 'BELINDA MALANDISA', isCouple: false, category: 'AMIS' },
      { name: 'EUNICE KAKOTO', isCouple: false, category: 'AMIS' },
      { name: 'JONATHAN NZEMA', isCouple: false, category: 'AMIS' },
      { name: 'IVONE MONGANGA', isCouple: false, category: 'AMIS' },
    ],
    'CESADOX': [
      { name: 'Couple MIFI', isCouple: true, category: 'COUPLE' },
      { name: 'Couple BEYA', isCouple: true, category: 'COUPLE' },
      { name: 'Couple LYDIE', isCouple: true, category: 'COUPLE' },
      { name: 'STEPHIE KAPESA', isCouple: false, category: 'AMIS' },
      { name: 'Ma ANNY', isCouple: false, category: 'AMIS' },
      { name: 'PLAME KAPESA', isCouple: false, category: 'AMIS' },
      { name: 'DJODJO KAPESA', isCouple: false, category: 'AMIS' },
    ],
  };

  // Build a lookup of existing guests by display name + table name
  const existingGuestKeys = new Set<string>();
  for (const g of currentGuests) {
    const tableName = g.tableId
      ? currentTables.find(t => t.id === g.tableId)?.name
      : 'NO_TABLE';
    if (tableName) {
      const key = `${(g.displayName || g.firstName).toUpperCase().trim()}@${tableName}`;
      existingGuestKeys.add(key);
    }
  }

  // Find missing guests
  const missingGuests: Array<{
    name: string;
    isCouple: boolean;
    category: string;
    tableName: string;
    tableId: string;
  }> = [];

  // Get the updated tables (after renumbering)
  const updatedTables = await db.table.findMany({ orderBy: { number: 'asc' } });
  const tableNameToId: Record<string, string> = {};
  for (const t of updatedTables) {
    tableNameToId[t.name] = t.id;
  }

  for (const [tableName, guests] of Object.entries(officialGuests)) {
    for (const guest of guests) {
      const key = `${guest.name.toUpperCase().trim()}@${tableName}`;
      // Also check alternate forms
      const altKey1 = `${guest.name.toUpperCase().replace('COUPLE ', 'COUPLE ')}@${tableName}`;
      const altKey2 = `${guest.name.toUpperCase()}@${tableName}`;

      if (!existingGuestKeys.has(key) && !existingGuestKeys.has(altKey1) && !existingGuestKeys.has(altKey2)) {
        const tableId = tableNameToId[tableName];
        if (tableId) {
          missingGuests.push({
            ...guest,
            tableName,
            tableId,
          });
        }
      }
    }
  }

  if (missingGuests.length > 0) {
    console.log(`  ${missingGuests.length} invité(s) manquant(s) détecté(s):\n`);
    for (const mg of missingGuests) {
      console.log(`  ➕ ${mg.name} → Table ${mg.tableName} (${mg.category}, ${mg.isCouple ? 'couple' : 'individuel'})`);
    }
    console.log('');

    // Add missing guests
    for (const mg of missingGuests) {
      let invitationCode = generateInvitationCode();
      // Ensure unique code
      while (await db.guest.findUnique({ where: { invitationCode } })) {
        invitationCode = generateInvitationCode();
      }

      const firstName = mg.name;
      const lastName = mg.name;

      await db.guest.create({
        data: {
          id: generateCuid(),
          firstName,
          lastName,
          displayName: mg.name,
          invitationType: mg.isCouple ? 'couple' : 'individuel',
          tableId: mg.tableId,
          seats: mg.isCouple ? 2 : 1,
          category: mg.category,
          status: 'PENDING',
          invitationCode,
          checkedIn: false,
          invitationViewed: false,
          invitationViewCount: 0,
          rsvpPlusOne: false,
        },
      });
      console.log(`  ✓ Ajouté: ${mg.name} → ${mg.tableName}`);
    }
  } else {
    console.log('  ✓ Aucun invité manquant détecté.');
  }

  // ==========================================
  // PHASE 6: MISE À JOUR DES CAPACITÉS
  // ==========================================
  console.log('\n📋 PHASE 6: MISE À JOUR DES CAPACITÉS DES TABLES\n');

  // Recount guests per table and update capacities
  const finalTables = await db.table.findMany({
    orderBy: { number: 'asc' },
    include: { guests: true },
  });

  for (const t of finalTables) {
    const guestCount = t.guests.reduce((sum, g) => sum + g.seats, 0);
    const officialGuestList = officialGuests[t.name];
    const officialCount = officialGuestList
      ? officialGuestList.reduce((sum, g) => sum + (g.isCouple ? 2 : 1), 0)
      : guestCount;
    const newCapacity = Math.max(officialCount, guestCount, 10);

    if (t.capacity !== newCapacity) {
      await db.table.update({
        where: { id: t.id },
        data: { capacity: newCapacity },
      });
      console.log(`  ✓ ${t.name} (#${t.number}): capacité ${t.capacity} → ${newCapacity}`);
    } else {
      console.log(`  ✓ ${t.name} (#${t.number}): capacité OK (${t.capacity})`);
    }
  }

  // ==========================================
  // PHASE 7: VÉRIFICATION FINALE
  // ==========================================
  console.log('\n📋 PHASE 7: VÉRIFICATION FINALE\n');

  const verifyTables = await db.table.findMany({
    orderBy: { number: 'asc' },
    include: { guests: true },
  });
  const verifyGuests = await db.guest.findMany({ include: { table: true } });

  console.log(`  ✓ Tables totales: ${verifyTables.length} (attendu: 31)`);
  console.log(`  ✓ Invités totaux: ${verifyGuests.length}`);

  // Check for guests without table
  const guestsWithoutTable = verifyGuests.filter(g => !g.tableId);
  if (guestsWithoutTable.length > 0) {
    console.log(`  ⚠️  Invités sans table: ${guestsWithoutTable.length}`);
    for (const g of guestsWithoutTable) {
      console.log(`    - ${g.displayName || g.firstName} (ID: ${g.id})`);
    }
  } else {
    console.log('  ✓ Tous les invités sont assignés à une table.');
  }

  // Check for duplicate invitation codes
  const codes = verifyGuests.map(g => g.invitationCode);
  const duplicateCodes = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicateCodes.length > 0) {
    console.log(`  ⚠️  Codes dupliqués: ${duplicateCodes.join(', ')}`);
  } else {
    console.log('  ✓ Aucun code d\'invitation dupliqué.');
  }

  // Check for duplicate guests (same displayName at same table)
  const guestTablePairs = verifyGuests.map(g => `${g.displayName}@${g.tableId}`);
  const duplicatePairs = guestTablePairs.filter((pair, index) => guestTablePairs.indexOf(pair) !== index);
  if (duplicatePairs.length > 0) {
    console.log(`  ⚠️  Invités dupliqués: ${duplicatePairs.join(', ')}`);
  } else {
    console.log('  ✓ Aucun invité dupliqué.');
  }

  // Verify each table matches official list
  console.log('\n  === CONFORMITÉ DES TABLES ===\n');
  let allMatch = true;
  for (const [num, name] of Object.entries(officialTables)) {
    const table = verifyTables.find(t => t.number === parseInt(num));
    if (!table) {
      console.log(`  ❌ Table #${num} ${name}: MANQUANTE`);
      allMatch = false;
    } else if (table.name !== name) {
      console.log(`  ❌ Table #${num}: nom "${table.name}" au lieu de "${name}"`);
      allMatch = false;
    } else {
      console.log(`  ✓ Table #${num}: ${name} (${table.guests.length} invités)`);
    }
  }

  // Verify guest counts per table
  console.log('\n  === DÉTAIL PAR TABLE ===\n');
  for (const t of verifyTables) {
    const official = officialGuests[t.name] || [];
    const dbGuests = t.guests.map(g => (g.displayName || g.firstName).toUpperCase().trim());
    const officialNames = official.map(g => g.name.toUpperCase().trim());

    const missing = officialNames.filter(n => !dbGuests.includes(n));
    const extra = dbGuests.filter(n => !officialNames.includes(n));

    if (missing.length > 0 || extra.length > 0) {
      console.log(`  ⚠️  Table #${t.number} ${t.name}:`);
      missing.forEach(n => console.log(`    - MANQUANT: ${n}`));
      extra.forEach(n => console.log(`    - EN PLUS: ${n}`));
    } else {
      console.log(`  ✓ Table #${t.number} ${t.name}: ${t.guests.length}/${official.length} invités ✓`);
    }
  }

  // ==========================================
  // RAPPORT FINAL
  // ==========================================
  console.log('\n=================================================');
  console.log('  RAPPORT FINAL DE SYNCHRONISATION');
  console.log('=================================================\n');
  console.log(`  Nombre total de tables: ${verifyTables.length}`);
  console.log(`  Confirmation 31 tables officielles: ${verifyTables.length === 31 ? '✅ OUI' : '❌ NON'}`);
  console.log(`  Nombre total d'invités: ${verifyGuests.length}`);
  console.log(`  Tables supprimées: ${tablesToDelete.length} (CESAKROL II, MAXSPRIN)`);
  console.log(`  Tables renumérotées: ${changes.filter(c => c.includes('→')).length}`);
  console.log(`  Invités ajoutés: ${missingGuests.length}`);
  console.log(`  Corrections d'orthographe: ${spellingFixes.length / 3} invité(s)`);
  console.log(`  Invités supprimés: 0 (aucun)`);
  console.log(`  Invités sans table: ${guestsWithoutTable.length}`);
  console.log(`  Toutes les tables conformes: ${allMatch ? '✅ OUI' : '❌ NON'}`);
  console.log('\n=================================================');
}

main()
  .then(() => {
    console.log('\n✅ Synchronisation terminée avec succès!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur lors de la synchronisation:', error);
    process.exit(1);
  });
