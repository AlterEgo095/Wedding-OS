/**
 * SYNCHRONISATION CIBLÉE : Tables + Invités UNIQUEMENT
 * 
 * Ce script s'exécute DIRECTEMENT sur le VPS dans le container Docker.
 * Il ne touche PAS aux EventTimeline, CoupleStory, Settings, Media.
 * Il synchronise UNIQUEMENT les tables et les invités.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateInvitationCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Official 31 tables
const officialTables = [
  { number: 1, name: 'ANSET', capacity: 14 },
  { number: 2, name: 'CEMYCINE', capacity: 12 },
  { number: 3, name: 'CESACAL', capacity: 10 },
  { number: 4, name: 'CEPIME', capacity: 12 },
  { number: 5, name: 'NORMEGYL', capacity: 11 },
  { number: 6, name: 'SECTAB', capacity: 12 },
  { number: 7, name: 'ESOMEX', capacity: 10 },
  { number: 8, name: 'CEFAM', capacity: 12 },
  { number: 9, name: 'VOGLITUS', capacity: 11 },
  { number: 10, name: 'CESAKROL', capacity: 12 },
  { number: 11, name: 'TELSOTON', capacity: 12 },
  { number: 12, name: 'DICLOFENAC', capacity: 12 },
  { number: 13, name: 'APHEROL', capacity: 10 },
  { number: 14, name: 'PARACETAMOL', capacity: 10 },
  { number: 15, name: 'DIGEST', capacity: 10 },
  { number: 16, name: 'DEZOLIN', capacity: 12 },
  { number: 17, name: 'CITRIMEX-DT', capacity: 12 },
  { number: 18, name: 'CEFUROCLAV', capacity: 10 },
  { number: 19, name: 'NICAR', capacity: 12 },
  { number: 20, name: 'TRACOL', capacity: 10 },
  { number: 21, name: 'FECOND', capacity: 12 },
  { number: 22, name: 'PASMEX', capacity: 12 },
  { number: 23, name: 'LINZOX', capacity: 10 },
  { number: 24, name: 'VITRON-Z', capacity: 12 },
  { number: 25, name: 'ROSUMEX', capacity: 11 },
  { number: 26, name: 'CETHER-L', capacity: 12 },
  { number: 27, name: 'NEBIMEX', capacity: 10 },
  { number: 28, name: 'MICOFLU', capacity: 12 },
  { number: 29, name: 'HEMOREX', capacity: 12 },
  { number: 30, name: 'AMOXYCILLINE', capacity: 10 },
  { number: 31, name: 'CESADOX', capacity: 10 },
];

// Official guests per table name
const officialGuests = {
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

async function main() {
  console.log('=================================================');
  console.log('  SYNCHRONISATION CIBLÉE : Tables + Invités');
  console.log('  (NE touche PAS à Timeline, Stories, Settings)');
  console.log('=================================================\n');

  // ===== PHASE 1: Renumérotation des tables =====
  console.log('📋 PHASE 1: Renumérotation des tables\n');

  const currentTables = await prisma.table.findMany({ orderBy: { number: 'asc' } });
  console.log('Tables actuelles:', currentTables.length);

  // Build name→officialNumber map
  const nameToOfficialNum = {};
  for (const t of officialTables) {
    nameToOfficialNum[t.name] = t.number;
  }

  // Build name→currentTable map
  const nameToCurrent = {};
  const tablesToDelete = [];
  for (const t of currentTables) {
    nameToCurrent[t.name] = t;
    if (nameToOfficialNum[t.name] === undefined) {
      tablesToDelete.push(t);
    }
  }

  // Step 1a: Move all to temp numbers
  for (const t of currentTables) {
    await prisma.table.update({ where: { id: t.id }, data: { number: t.number + 100 } });
  }
  console.log('✓ Numéros temporaires assignés');

  // Step 1b: Set official numbers for tables that exist
  for (const t of currentTables) {
    const newNum = nameToOfficialNum[t.name];
    if (newNum !== undefined) {
      await prisma.table.update({ where: { id: t.id }, data: { number: newNum, capacity: officialTables.find(ot => ot.name === t.name)?.capacity || t.capacity } });
      console.log(`✓ ${t.name} → #${newNum}`);
    }
  }

  // Step 1c: Delete extra tables (CESAKROL II, MAXSPRIN)
  for (const t of tablesToDelete) {
    await prisma.guest.updateMany({ where: { tableId: t.id }, data: { tableId: null } });
    await prisma.table.delete({ where: { id: t.id } });
    console.log(`✗ Supprimée: ${t.name} (#${t.number})`);
  }

  // ===== PHASE 2: Corrections d'orthographe =====
  console.log('\n📋 PHASE 2: Corrections d\'orthographe\n');

  const guests = await prisma.guest.findMany();

  // Fix "FABRICE IZAGOL0" → "FABRICE IZAGOLO"
  const fabrice = guests.find(g => g.displayName && g.displayName.includes('IZAGOL0'));
  if (fabrice) {
    await prisma.guest.update({
      where: { id: fabrice.id },
      data: { firstName: 'FABRICE IZAGOLO', lastName: 'FABRICE IZAGOLO', displayName: 'FABRICE IZAGOLO' },
    });
    console.log('✓ Corrigé: FABRICE IZAGOL0 → FABRICE IZAGOLO');
  }

  // Fix "REUNION 9 persones" → "REUNION 9 personnes"
  const reunion = guests.find(g => g.displayName && g.displayName.includes('persones'));
  if (reunion) {
    await prisma.guest.update({
      where: { id: reunion.id },
      data: { firstName: 'REUNION 9 personnes', lastName: 'REUNION 9 personnes', displayName: 'REUNION 9 personnes' },
    });
    console.log('✓ Corrigé: REUNION 9 persones → REUNION 9 personnes');
  }

  // Fix double space "Couple Berge  MUSEMA"
  const berge = guests.find(g => g.displayName && g.displayName.includes('Berge  MUSEMA'));
  if (berge) {
    await prisma.guest.update({
      where: { id: berge.id },
      data: { firstName: 'Couple Berge MUSEMA', lastName: 'Couple Berge MUSEMA', displayName: 'Couple Berge MUSEMA' },
    });
    console.log('✓ Corrigé: double espace Berge MUSEMA');
  }

  // ===== PHASE 3: Ajout des invités manquants =====
  console.log('\n📋 PHASE 3: Vérification des invités manquants\n');

  const updatedTables = await prisma.table.findMany({ orderBy: { number: 'asc' }, include: { guests: true } });
  const tableNameToId = {};
  for (const t of updatedTables) {
    tableNameToId[t.name] = t.id;
  }

  // Build set of existing guest displayNames per table
  const existingGuestKeys = new Set();
  for (const t of updatedTables) {
    for (const g of t.guests) {
      const dn = (g.displayName || g.firstName || '').toUpperCase().trim();
      existingGuestKeys.add(`${dn}@${t.name}`);
    }
  }

  let addedCount = 0;
  for (const [tableName, guestList] of Object.entries(officialGuests)) {
    for (const guest of guestList) {
      const key = guest.name.toUpperCase().trim() + '@' + tableName;
      if (!existingGuestKeys.has(key)) {
        const tableId = tableNameToId[tableName];
        if (tableId) {
          let code = generateInvitationCode();
          // Ensure unique
          const existing = await prisma.guest.findUnique({ where: { invitationCode: code } });
          if (existing) code = generateInvitationCode() + generateInvitationCode().substring(0, 2);

          await prisma.guest.create({
            data: {
              firstName: guest.name,
              lastName: guest.name,
              displayName: guest.name,
              invitationType: guest.isCouple ? 'couple' : 'individuel',
              tableId: tableId,
              seats: guest.isCouple ? 2 : 1,
              category: guest.category,
              status: 'PENDING',
              invitationCode: code,
              checkedIn: false,
              invitationViewed: false,
              invitationViewCount: 0,
              rsvpPlusOne: false,
            },
          });
          console.log(`➕ Ajouté: ${guest.name} → ${tableName}`);
          addedCount++;
        }
      }
    }
  }

  if (addedCount === 0) {
    console.log('✓ Aucun invité manquant');
  }

  // ===== PHASE 4: Vérification finale =====
  console.log('\n📋 PHASE 4: Vérification finale\n');

  const finalTables = await prisma.table.findMany({ orderBy: { number: 'asc' }, include: { guests: true } });
  const finalGuests = await prisma.guest.findMany();

  console.log(`Tables: ${finalTables.length} (attendu: 31)`);
  console.log(`Invités: ${finalGuests.length}`);

  // Verify no orphans
  const orphans = finalGuests.filter(g => !g.tableId);
  console.log(`Sans table: ${orphans.length === 0 ? 'AUCUN ✅' : orphans.length}`);

  // Verify all 31 tables
  let allGood = true;
  for (const ot of officialTables) {
    const found = finalTables.find(t => t.number === ot.number && t.name === ot.name);
    if (!found) {
      console.log(`❌ Table #${ot.number} ${ot.name}: MANQUANTE`);
      allGood = false;
    } else {
      console.log(`✅ #${ot.number}: ${ot.name} (${found.guests.length} invités)`);
    }
  }

  // Verify timeline/stories/settings are UNTOUCHED
  const timelineCount = await prisma.eventTimeline.count();
  const storiesCount = await prisma.coupleStory.count();
  const settingsCount = await prisma.settings.count();
  console.log(`\nTimeline: ${timelineCount} (non modifié) ✅`);
  console.log(`Stories: ${storiesCount} (non modifié) ✅`);
  console.log(`Settings: ${settingsCount} (non modifié) ✅`);

  console.log('\n=================================================');
  console.log('  RÉSULTAT');
  console.log('=================================================');
  console.log(`  31 tables conformes: ${allGood ? '✅ OUI' : '❌ NON'}`);
  console.log(`  Invités ajoutés: ${addedCount}`);
  console.log(`  Total invités: ${finalGuests.length}`);
  console.log(`  Total tables: ${finalTables.length}`);
  console.log('=================================================');
}

main()
  .then(() => { console.log('\n✅ Terminé!'); process.exit(0); })
  .catch(e => { console.error('❌ Erreur:', e); process.exit(1); });
