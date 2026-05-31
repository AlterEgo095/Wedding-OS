import { db } from './src/lib/db'
import { hashPassword } from './src/lib/auth'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

async function seed() {
  console.log('🌱 Seeding database with real wedding data...')

  // ─── Admin Users ──────────────────────────────────────────────
  const existingAdmin = await db.adminUser.findUnique({ where: { email: 'admin@mariage.fr' } })
  if (!existingAdmin) {
    const hashedPassword = await hashPassword('admin123')
    await db.adminUser.create({
      data: {
        email: 'admin@mariage.fr',
        password: hashedPassword,
        name: 'Admin Principal',
        role: 'SUPER_ADMIN',
      },
    })
    console.log('✅ Created Super Admin: admin@mariage.fr / admin123')
  }

  const existingOrganizer = await db.adminUser.findUnique({ where: { email: 'organizer@mariage.fr' } })
  if (!existingOrganizer) {
    const hashedPassword = await hashPassword('organizer123')
    await db.adminUser.create({
      data: {
        email: 'organizer@mariage.fr',
        password: hashedPassword,
        name: 'Organisateur',
        role: 'ORGANIZER',
      },
    })
    console.log('✅ Created Organizer: organizer@mariage.fr / organizer123')
  }

  const existingReception = await db.adminUser.findUnique({ where: { email: 'reception@mariage.fr' } })
  if (!existingReception) {
    const hashedPassword = await hashPassword('reception123')
    await db.adminUser.create({
      data: {
        email: 'reception@mariage.fr',
        password: hashedPassword,
        name: 'Accueil',
        role: 'RECEPTION',
      },
    })
    console.log('✅ Created Reception: reception@mariage.fr / reception123')
  }

  const existingController = await db.adminUser.findUnique({ where: { email: 'controller@mariage.fr' } })
  if (!existingController) {
    const hashedPassword = await hashPassword('controller123')
    await db.adminUser.create({
      data: {
        email: 'controller@mariage.fr',
        password: hashedPassword,
        name: 'Contrôleur',
        role: 'CONTROLLER',
      },
    })
    console.log('✅ Created Controller: controller@mariage.fr / controller123')
  }

  // ─── Clean existing data ──────────────────────────────────────
  console.log('🧹 Cleaning existing data...')
  await db.guest.deleteMany()
  await db.table.deleteMany()
  await db.eventTimeline.deleteMany()
  await db.coupleStory.deleteMany()
  await db.media.deleteMany()
  await db.settings.deleteMany()

  // ─── Tables ───────────────────────────────────────────────────
  const tablesData = [
    { name: 'ANSET', number: 1, capacity: 14 },
    { name: 'CEMYCINE', number: 2, capacity: 12 },
    { name: 'CESAKROL', number: 3, capacity: 12 },
    { name: 'DIGEST', number: 4, capacity: 12 },
    { name: 'CEFAM', number: 5, capacity: 12 },
    { name: 'NORMEGYL', number: 6, capacity: 12 },
    { name: 'CITRIMEX-DT', number: 7, capacity: 12 },
    { name: 'APHEROL', number: 8, capacity: 12 },
    { name: 'NICAR', number: 9, capacity: 14 },
    { name: 'CEFUROCLAV', number: 10, capacity: 12 },
    { name: 'CESACAL', number: 11, capacity: 12 },
    { name: 'TRACOL', number: 12, capacity: 14 },
    { name: 'CEPIME', number: 13, capacity: 14 },
    { name: 'FECOND', number: 14, capacity: 12 },
    { name: 'ESOMEX', number: 15, capacity: 12 },
    { name: 'PASMEX', number: 16, capacity: 12 },
    { name: 'LINZOX', number: 17, capacity: 12 },
    { name: 'VITRON-Z', number: 18, capacity: 12 },
    { name: 'VOGLITUS', number: 19, capacity: 12 },
    { name: 'TELSOTON', number: 20, capacity: 12 },
    { name: 'ROSUMEX', number: 21, capacity: 14 },
    { name: 'CESAKROL II', number: 22, capacity: 12 },
    { name: 'CETHER-L', number: 23, capacity: 12 },
    { name: 'NEBIMEX', number: 24, capacity: 12 },
    { name: 'HEMOREX', number: 25, capacity: 10 },
    { name: 'MAXSPRIN', number: 26, capacity: 12 },
    { name: 'DEZOLIN', number: 27, capacity: 12 },
    { name: 'MICOFLU', number: 28, capacity: 12 },
  ]

  const tables: Record<number, string> = {}
  for (const t of tablesData) {
    const table = await db.table.create({
      data: { name: t.name, number: t.number, capacity: t.capacity },
    })
    tables[t.number] = table.id
  }
  console.log(`✅ Created ${tablesData.length} tables`)

  // ─── Guests ───────────────────────────────────────────────────
  type GuestInput = {
    firstName: string
    lastName: string
    tableNumber: number
    seats: number
    category: string
    personalMessage?: string
  }

  const guests: GuestInput[] = [
    // Table 1 - ANSET
    { firstName: 'Pasteur', lastName: 'GUYGUY', tableNumber: 1, seats: 2, category: 'VIP', personalMessage: 'Bienvenue Pasteur, votre présence est une bénédiction !' },
    { firstName: 'Pasteur', lastName: 'PECHO', tableNumber: 1, seats: 2, category: 'VIP', personalMessage: 'Merci d\'être là pour célébrer avec nous !' },
    { firstName: 'Berge', lastName: 'MUSEMA', tableNumber: 1, seats: 2, category: 'FAMILLE' },
    { firstName: 'Berge', lastName: 'SERGE', tableNumber: 1, seats: 2, category: 'FAMILLE' },
    { firstName: 'Berge', lastName: 'KALO', tableNumber: 1, seats: 2, category: 'FAMILLE' },
    { firstName: 'Tante', lastName: 'BODIKO', tableNumber: 1, seats: 2, category: 'FAMILLE', personalMessage: 'Chère Tante, votre amour nous guide toujours !' },

    // Table 2 - CEMYCINE
    { firstName: 'Paul', lastName: '', tableNumber: 2, seats: 2, category: 'VIP' },
    { firstName: 'Pasteur', lastName: 'IMBULE', tableNumber: 2, seats: 2, category: 'VIP' },
    { firstName: 'Marie', lastName: 'JEANE', tableNumber: 2, seats: 1, category: 'FAMILLE' },
    { firstName: 'Michel', lastName: '', tableNumber: 2, seats: 2, category: 'AMIS' },
    { firstName: 'Marck', lastName: '', tableNumber: 2, seats: 2, category: 'AMIS' },
    { firstName: 'Garcia', lastName: '', tableNumber: 2, seats: 1, category: 'AMIS' },
    { firstName: 'Chantal', lastName: 'DJONGA', tableNumber: 2, seats: 1, category: 'AMIS' },
    { firstName: 'Parrain', lastName: '', tableNumber: 2, seats: 2, category: 'VIP', personalMessage: 'Cher Parrain, votre soutien signifie tout pour nous !' },

    // Table 3 - CESAKROL
    { firstName: 'Thethe', lastName: 'LIBAZA', tableNumber: 3, seats: 1, category: 'AMIS' },
    { firstName: 'Elma', lastName: 'LIBAZA', tableNumber: 3, seats: 1, category: 'AMIS' },
    { firstName: 'Meya', lastName: '', tableNumber: 3, seats: 2, category: 'AMIS' },
    { firstName: 'Fabrice', lastName: '', tableNumber: 3, seats: 2, category: 'AMIS' },
    { firstName: 'Florida', lastName: '', tableNumber: 3, seats: 2, category: 'AMIS' },
    { firstName: 'Clarise', lastName: 'MOTELU', tableNumber: 3, seats: 1, category: 'AMIS' },
    { firstName: 'Wemba', lastName: '', tableNumber: 3, seats: 2, category: 'AMIS' },
    { firstName: 'Rachel', lastName: 'LIBAZA', tableNumber: 3, seats: 1, category: 'AMIS' },

    // Table 4 - DIGEST
    { firstName: 'Bumba', lastName: '', tableNumber: 4, seats: 2, category: 'AMIS' },
    { firstName: 'Bavon', lastName: '', tableNumber: 4, seats: 2, category: 'AMIS' },
    { firstName: 'Huguette', lastName: '', tableNumber: 4, seats: 2, category: 'AMIS' },
    { firstName: 'Pa', lastName: 'SODA', tableNumber: 4, seats: 2, category: 'AMIS' },
    { firstName: 'Mboyo', lastName: '', tableNumber: 4, seats: 2, category: 'AMIS' },
    { firstName: 'Pa', lastName: 'Rossy', tableNumber: 4, seats: 2, category: 'AMIS' },

    // Table 5 - CEFAM
    { firstName: 'Abani', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },
    { firstName: 'Kalambayi', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },
    { firstName: 'Mbele', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },
    { firstName: 'Izuele', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },
    { firstName: 'Bena', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },
    { firstName: 'Mutitwa', lastName: '', tableNumber: 5, seats: 2, category: 'AMIS' },

    // Table 6 - NORMEGYL
    { firstName: 'Mbele', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },
    { firstName: 'Mputu', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },
    { firstName: 'Bilu', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },
    { firstName: 'Djodjo', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },
    { firstName: 'Hernandez', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },
    { firstName: 'Diego', lastName: '', tableNumber: 6, seats: 2, category: 'AMIS' },

    // Table 7 - CITRIMEX-DT
    { firstName: 'Nzila', lastName: 'MATONDO', tableNumber: 7, seats: 2, category: 'AMIS' },
    { firstName: 'Elvice', lastName: 'KOYALA', tableNumber: 7, seats: 2, category: 'AMIS' },
    { firstName: 'Joel', lastName: 'MALUNDA', tableNumber: 7, seats: 2, category: 'AMIS' },
    { firstName: 'Ben', lastName: 'MUZOMWE', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Isaac', lastName: 'WASSA', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Nickson', lastName: 'DONGO', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Vinny', lastName: 'BENDE', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Francy', lastName: 'MOKOLI', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Glody', lastName: 'MASANDI', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'David', lastName: 'MANYA', tableNumber: 7, seats: 1, category: 'AMIS' },
    { firstName: 'Djenny', lastName: '', tableNumber: 7, seats: 1, category: 'AMIS' },

    // Table 8 - APHEROL
    { firstName: 'Hilda', lastName: '', tableNumber: 8, seats: 2, category: 'AMIS' },
    { firstName: 'Lukia', lastName: '', tableNumber: 8, seats: 2, category: 'AMIS' },
    { firstName: 'Molayi', lastName: '', tableNumber: 8, seats: 2, category: 'AMIS' },
    { firstName: 'Ngango', lastName: '', tableNumber: 8, seats: 2, category: 'AMIS' },
    { firstName: 'Giresse', lastName: 'ZIRI', tableNumber: 8, seats: 2, category: 'AMIS' },
    { firstName: 'Jered\'Art', lastName: '', tableNumber: 8, seats: 2, category: 'AMIS' },

    // Table 9 - NICAR
    { firstName: 'Platinie', lastName: '', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Jose', lastName: 'MPAKA', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Mazuda', lastName: '', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Yelenge', lastName: '', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Maurise', lastName: '', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Sera', lastName: 'MADEFU', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Cadette', lastName: 'SUNDA', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Fr', lastName: 'MEDIO', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Zackarie', lastName: '', tableNumber: 9, seats: 2, category: 'AMIS' },
    { firstName: 'Josué', lastName: 'LIBAZA', tableNumber: 9, seats: 1, category: 'AMIS' },
    { firstName: 'Norna', lastName: 'LIBAZA', tableNumber: 9, seats: 1, category: 'AMIS' },

    // Table 10 - CEFUROCLAV
    { firstName: 'Bodiko', lastName: '', tableNumber: 10, seats: 2, category: 'FAMILLE' },
    { firstName: 'Lissete', lastName: '', tableNumber: 10, seats: 1, category: 'FAMILLE' },
    { firstName: 'Nadege', lastName: '', tableNumber: 10, seats: 1, category: 'FAMILLE' },
    { firstName: 'Dada', lastName: '', tableNumber: 10, seats: 2, category: 'FAMILLE' },
    { firstName: 'Osee', lastName: 'BOPUPA', tableNumber: 10, seats: 1, category: 'FAMILLE' },
    { firstName: 'Miche', lastName: '', tableNumber: 10, seats: 2, category: 'FAMILLE' },
    { firstName: 'Elie', lastName: 'JOSEPH', tableNumber: 10, seats: 1, category: 'FAMILLE' },
    { firstName: 'Kyria', lastName: '', tableNumber: 10, seats: 2, category: 'FAMILLE' },

    // Table 11 - CESACAL
    { firstName: 'Nehemie', lastName: '', tableNumber: 11, seats: 2, category: 'FAMILLE' },
    { firstName: 'Fr', lastName: 'GUELORD', tableNumber: 11, seats: 2, category: 'VIP' },
    { firstName: 'Motenda', lastName: '', tableNumber: 11, seats: 2, category: 'AMIS' },
    { firstName: 'Deborha', lastName: '', tableNumber: 11, seats: 2, category: 'AMIS' },
    { firstName: 'Give', lastName: 'Ilunga', tableNumber: 11, seats: 1, category: 'AMIS' },
    { firstName: 'Prisca', lastName: 'ILUNGA', tableNumber: 11, seats: 1, category: 'AMIS' },
    { firstName: 'Fr', lastName: 'Franklin MBONGO', tableNumber: 11, seats: 1, category: 'VIP' },
    { firstName: 'Ma', lastName: 'ONO', tableNumber: 11, seats: 1, category: 'FAMILLE' },

    // Table 12 - TRACOL
    { firstName: 'Blaise', lastName: '', tableNumber: 12, seats: 2, category: 'AMIS' },
    { firstName: 'Djymie', lastName: '', tableNumber: 12, seats: 2, category: 'AMIS' },
    { firstName: 'Système', lastName: '', tableNumber: 12, seats: 2, category: 'AMIS' },
    { firstName: 'Gloria', lastName: 'MONTA', tableNumber: 12, seats: 1, category: 'AMIS' },
    { firstName: 'Albert', lastName: '', tableNumber: 12, seats: 1, category: 'AMIS' },
    { firstName: 'Hipolite', lastName: '', tableNumber: 12, seats: 1, category: 'AMIS' },
    { firstName: 'Kazadi', lastName: '', tableNumber: 12, seats: 2, category: 'AMIS' },

    // Table 13 - CEPIME
    { firstName: 'Kamba', lastName: '', tableNumber: 13, seats: 2, category: 'AMIS' },
    { firstName: 'Bob', lastName: '', tableNumber: 13, seats: 2, category: 'AMIS' },
    { firstName: 'Guslaine', lastName: '', tableNumber: 13, seats: 1, category: 'AMIS' },
    { firstName: 'Deborha', lastName: '', tableNumber: 13, seats: 1, category: 'AMIS' },
    { firstName: 'Djenny', lastName: '', tableNumber: 13, seats: 1, category: 'AMIS' },
    { firstName: 'Atocha', lastName: 'SARAH', tableNumber: 13, seats: 1, category: 'AMIS' },
    { firstName: 'Munguanzi', lastName: '', tableNumber: 13, seats: 2, category: 'AMIS' },
    { firstName: 'Kapinga', lastName: 'ANNIE', tableNumber: 13, seats: 1, category: 'AMIS' },
    { firstName: 'Seya', lastName: '', tableNumber: 13, seats: 1, category: 'AMIS' },

    // Table 14 - FECOND
    { firstName: 'Mvita', lastName: '', tableNumber: 14, seats: 2, category: 'AMIS' },
    { firstName: 'Sharonw', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Malachie', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Mbuyi', lastName: 'ELIE', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Wislet', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Kasema', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Nash', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Jeremie', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Benji', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Eliezer', lastName: '', tableNumber: 14, seats: 1, category: 'AMIS' },
    { firstName: 'Dr', lastName: 'PACKEL', tableNumber: 14, seats: 1, category: 'VIP' },

    // Table 15 - ESOMEX
    { firstName: 'Franc', lastName: '', tableNumber: 15, seats: 2, category: 'AMIS' },
    { firstName: 'Victor', lastName: 'HUGO', tableNumber: 15, seats: 2, category: 'AMIS' },
    { firstName: 'Guelor', lastName: 'BIDE', tableNumber: 15, seats: 2, category: 'AMIS' },
    { firstName: 'Joseline', lastName: 'WASSA', tableNumber: 15, seats: 1, category: 'AMIS' },
    { firstName: 'Odette', lastName: '', tableNumber: 15, seats: 1, category: 'AMIS' },
    { firstName: 'Fanny', lastName: 'YEVUNDU', tableNumber: 15, seats: 1, category: 'AMIS' },
    { firstName: 'Christevie', lastName: 'Wassa', tableNumber: 15, seats: 1, category: 'AMIS' },
    { firstName: 'Pierrette', lastName: 'IZAGOLA', tableNumber: 15, seats: 1, category: 'AMIS' },
    { firstName: 'Elie', lastName: 'LIBAZA', tableNumber: 15, seats: 1, category: 'AMIS' },

    // Table 16 - PASMEX
    { firstName: 'Isaac', lastName: 'WASSA', tableNumber: 16, seats: 2, category: 'AMIS' },
    { firstName: 'Kina', lastName: '', tableNumber: 16, seats: 2, category: 'AMIS' },
    { firstName: 'Shako', lastName: '', tableNumber: 16, seats: 2, category: 'AMIS' },
    { firstName: 'Gloiries', lastName: 'SANALISE', tableNumber: 16, seats: 1, category: 'AMIS' },
    { firstName: 'Benedicte', lastName: 'NDAKA', tableNumber: 16, seats: 1, category: 'AMIS' },
    { firstName: 'Djenny', lastName: '', tableNumber: 16, seats: 1, category: 'AMIS' },
    { firstName: 'Jamar', lastName: '', tableNumber: 16, seats: 1, category: 'AMIS' },
    { firstName: 'Tade', lastName: '', tableNumber: 16, seats: 1, category: 'AMIS' },
    { firstName: 'Deborha', lastName: 'KABUYA', tableNumber: 16, seats: 1, category: 'AMIS' },

    // Table 17 - LINZOX
    { firstName: 'Herve', lastName: 'WASSA', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Israel', lastName: '', tableNumber: 17, seats: 2, category: 'AMIS' },
    { firstName: 'Tito', lastName: '', tableNumber: 17, seats: 2, category: 'AMIS' },
    { firstName: 'Adiko', lastName: '', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Ferro', lastName: '', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Kaddy', lastName: '', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Jonas', lastName: 'WASSA', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Jack', lastName: 'LEMBI', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Anno', lastName: 'MAYEMBO', tableNumber: 17, seats: 1, category: 'AMIS' },
    { firstName: 'Didier', lastName: 'TEBWA', tableNumber: 17, seats: 1, category: 'AMIS' },

    // Table 18 - VITRON-Z
    { firstName: 'Jeremie', lastName: 'WASSA', tableNumber: 18, seats: 2, category: 'AMIS' },
    { firstName: 'Danny', lastName: 'BEDI', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Valencia', lastName: '', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Tonny', lastName: 'NDOMBA', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Koko', lastName: 'KUKU', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Henock', lastName: '', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Vaneck', lastName: '', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Reagan', lastName: 'LINAKA', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Didier', lastName: 'TEBWA', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Charle', lastName: '', tableNumber: 18, seats: 1, category: 'AMIS' },
    { firstName: 'Adan', lastName: '', tableNumber: 18, seats: 1, category: 'AMIS' },

    // Table 19 - VOGLITUS
    { firstName: 'Aristote', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Sandra', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Aristote', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Franklin', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Aris', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Lumiere', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Baby', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Grace', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Pamela', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Eliel', lastName: '', tableNumber: 19, seats: 1, category: 'AMIS' },
    { firstName: 'Kifata', lastName: '', tableNumber: 19, seats: 2, category: 'AMIS' },

    // Table 20 - TELSOTON
    { firstName: 'Glody', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },
    { firstName: 'Florida', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },
    { firstName: 'Mireil', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },
    { firstName: 'Claris', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },
    { firstName: 'Meya', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },
    { firstName: 'Antho', lastName: '', tableNumber: 20, seats: 2, category: 'AMIS' },

    // Table 21 - ROSUMEX
    { firstName: 'Fabrice', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Faida', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Nadege', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Melva', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Divine', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Junette', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Obedine', lastName: 'IZAGOLA', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Celine', lastName: '', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Tychique', lastName: 'IZAGOLO', tableNumber: 21, seats: 1, category: 'FAMILLE' },
    { firstName: 'Andy', lastName: 'MBUMBA', tableNumber: 21, seats: 1, category: 'AMIS' },
    { firstName: 'Kathy', lastName: '', tableNumber: 21, seats: 2, category: 'AMIS' },

    // Table 22 - CESAKROL II
    { firstName: 'Liza', lastName: '', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Christel', lastName: '', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Marie', lastName: 'FRANCOISE', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Marie', lastName: 'DANIELA', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Raisa', lastName: '', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Arlon', lastName: '', tableNumber: 22, seats: 1, category: 'AMIS' },
    { firstName: 'Cecile', lastName: '', tableNumber: 22, seats: 2, category: 'AMIS' },
    { firstName: 'Farida', lastName: '', tableNumber: 22, seats: 1, category: 'AMIS' },

    // Table 23 - CETHER-L
    { firstName: 'Kapesa', lastName: '', tableNumber: 23, seats: 2, category: 'AMIS' },
    { firstName: 'Christian', lastName: '', tableNumber: 23, seats: 2, category: 'AMIS' },
    { firstName: 'Okito', lastName: '', tableNumber: 23, seats: 2, category: 'AMIS' },
    { firstName: 'Berako', lastName: '', tableNumber: 23, seats: 2, category: 'AMIS' },
    { firstName: 'Princilia', lastName: '', tableNumber: 23, seats: 1, category: 'AMIS' },
    { firstName: 'Mimie', lastName: '', tableNumber: 23, seats: 1, category: 'AMIS' },
    { firstName: 'Julie', lastName: '', tableNumber: 23, seats: 1, category: 'AMIS' },
    { firstName: 'Belinda', lastName: '', tableNumber: 23, seats: 1, category: 'AMIS' },

    // Table 24 - NEBIMEX
    { firstName: 'Regine', lastName: '', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Sarah', lastName: 'EKOFO', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Mama', lastName: 'EKOFO', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Sabina', lastName: '', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Eunice', lastName: '', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Eugenie', lastName: '', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Mimie', lastName: '', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Pa', lastName: 'DENIS', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Eunice', lastName: 'EDIA', tableNumber: 24, seats: 1, category: 'FAMILLE' },
    { firstName: 'Mogolia', lastName: 'PAPY', tableNumber: 24, seats: 1, category: 'FAMILLE' },

    // Table 25 - HEMOREX
    { firstName: 'Yanick', lastName: 'SHOUNGU', tableNumber: 25, seats: 2, category: 'AMIS' },
    { firstName: 'Fataki', lastName: '', tableNumber: 25, seats: 2, category: 'AMIS' },
    { firstName: 'Naomie', lastName: 'KAPINGA', tableNumber: 25, seats: 2, category: 'AMIS' },
    { firstName: 'Hilair', lastName: '', tableNumber: 25, seats: 2, category: 'AMIS' },
    { firstName: 'Jonathan', lastName: 'NZEMA', tableNumber: 25, seats: 1, category: 'AMIS' },
    { firstName: 'Manu', lastName: '', tableNumber: 25, seats: 1, category: 'AMIS' },

    // Table 26 - MAXSPRIN
    { firstName: 'Abigael', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },
    { firstName: 'Milka', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },
    { firstName: 'Lagerdie', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },
    { firstName: 'Irene', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },
    { firstName: 'Osee', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },
    { firstName: 'Berlette', lastName: '', tableNumber: 26, seats: 2, category: 'AMIS' },

    // Table 27 - DEZOLIN
    { firstName: 'Seraphin', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },
    { firstName: 'Guyaume', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },
    { firstName: 'Cedrick', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },
    { firstName: 'Pelagie', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },
    { firstName: 'Francoise', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },
    { firstName: 'Judith', lastName: '', tableNumber: 27, seats: 2, category: 'AMIS' },

    // Table 28 - MICOFLU
    { firstName: 'Aime', lastName: '', tableNumber: 28, seats: 2, category: 'AMIS' },
    { firstName: 'Brigitte', lastName: '', tableNumber: 28, seats: 2, category: 'AMIS' },
    { firstName: 'Kenedi', lastName: '', tableNumber: 28, seats: 2, category: 'AMIS' },
    { firstName: 'Laurette', lastName: '', tableNumber: 28, seats: 2, category: 'AMIS' },
    { firstName: 'Julie', lastName: '', tableNumber: 28, seats: 1, category: 'AMIS' },
    { firstName: 'Pa', lastName: 'JOSE', tableNumber: 28, seats: 1, category: 'AMIS' },
    { firstName: 'Masalo', lastName: '', tableNumber: 28, seats: 2, category: 'AMIS' },
  ]

  for (const guest of guests) {
    await db.guest.create({
      data: {
        firstName: guest.firstName,
        lastName: guest.lastName || '',
        tableId: tables[guest.tableNumber],
        seats: guest.seats,
        category: guest.category,
        status: 'CONFIRMED',
        invitationCode: generateCode(),
        personalMessage: guest.personalMessage || null,
      },
    })
  }
  console.log(`✅ Created ${guests.length} guests`)

  // ─── Timeline Events ──────────────────────────────────────────
  const events = [
    { time: '10:00', activity: 'Arrivée et Accueil', location: 'Hall Principal', description: 'Accueil des invités avec cocktail de bienvenue', order: 0 },
    { time: '11:00', activity: 'Cérémonie Religieuse', location: 'Église', description: 'Bénédiction nuptiale et échange des vœux', order: 1 },
    { time: '12:30', activity: 'Photos de Groupe', location: 'Jardin', description: 'Séance photos avec les mariés et les invités', order: 2 },
    { time: '13:00', activity: 'Cocktail d\'Honneur', location: 'Terrasse', description: 'Vin d\'honneur et amuse-bouches', order: 3 },
    { time: '14:30', activity: 'Entrée des Mariés', location: 'Grande Salle', description: 'Présentation du couple aux invités', order: 4 },
    { time: '15:00', activity: 'Déjeuner de Fête', location: 'Grande Salle', description: 'Repas de fête avec les invités', order: 5 },
    { time: '17:00', activity: 'Discours et Témoignages', location: 'Scène', description: 'Témoignages des proches et familles', order: 6 },
    { time: '18:00', activity: 'Coupe du Gâteau', location: 'Scène', description: 'Coupe du gâteau de mariage', order: 7 },
    { time: '19:00', activity: 'Première Danse', location: 'Piste de Danse', description: 'Danse inaugurale des mariés', order: 8 },
    { time: '19:30', activity: 'Soirée Dansante', location: 'Piste de Danse', description: 'DJ et animations musicales', order: 9 },
    { time: '22:00', activity: 'Feu d\'Artifice', location: 'Jardin', description: 'Spectacle pyrotechnique', order: 10 },
    { time: '23:00', activity: 'Souper de Minuit', location: 'Buffet', description: 'Collation tardive pour les invités', order: 11 },
  ]

  for (const event of events) {
    await db.eventTimeline.create({ data: event })
  }
  console.log(`✅ Created ${events.length} timeline events`)

  // ─── Couple Stories ───────────────────────────────────────────
  const stories = [
    {
      title: 'Notre Première Rencontre',
      description: 'Un hasard magnifique qui a changé nos vies à jamais. Nos regards se sont croisés et nous avons su que quelque chose de spécial venait de commencer.',
      date: '2021',
      imageUrl: '/upload/couple-photo-1.jpeg',
      order: 0,
    },
    {
      title: 'Le Premier « Je t\'aime »',
      description: 'Les mots les plus beaux sont ceux qui viennent du cœur. Ce moment restera gravé dans nos mémoires pour l\'éternité.',
      date: '2022',
      imageUrl: '/upload/couple-photo-2.png',
      order: 1,
    },
    {
      title: 'La Demande en Mariage',
      description: 'Un genou à terre, un anneau brillant, et des larmes de joie. Le jour où notre destin s\'est scellé pour toujours.',
      date: '2023',
      imageUrl: '/upload/couple-photo-1.jpeg',
      order: 2,
    },
    {
      title: 'Vers le Grand Jour',
      description: 'Les préparatifs, l\'excitation, et l\'impatience de célébrer notre amour avec tous ceux que nous aimons.',
      date: '2024',
      imageUrl: '/upload/couple-photo-2.png',
      order: 3,
    },
  ]

  for (const story of stories) {
    await db.coupleStory.create({ data: story })
  }
  console.log(`✅ Created ${stories.length} couple stories`)

  // ─── Media ────────────────────────────────────────────────────
  const media = [
    { type: 'PHOTO', url: '/upload/couple-photo-1.jpeg', title: 'Photo du Couple 1', category: 'COUPLE_STORY', order: 0 },
    { type: 'PHOTO', url: '/upload/couple-photo-2.png', title: 'Photo du Couple 2', category: 'COUPLE_STORY', order: 1 },
    { type: 'PHOTO', url: '/upload/wedding-hero.png', title: 'Image Hero', category: 'GALLERY', order: 2 },
    { type: 'PHOTO', url: '/upload/couple-story.png', title: 'Notre Histoire', category: 'GALLERY', order: 3 },
  ]

  for (const m of media) {
    await db.media.create({ data: m })
  }
  console.log(`✅ Created ${media.length} media items`)

  // ─── Settings ─────────────────────────────────────────────────
  const settings = [
    { key: 'groom_name', value: 'Alexandre' },
    { key: 'bride_name', value: 'Béatrice' },
    { key: 'couple_photo_1', value: '/upload/couple-photo-1.jpeg' },
    { key: 'couple_photo_2', value: '/upload/couple-photo-2.png' },
    { key: 'couple_story', value: 'Un amour né sous le soleil de la grâce divine, béni par Dieu et célébré par tous nos proches.' },
    { key: 'wedding_date', value: '2025-09-15' },
    { key: 'wedding_time', value: '10:00' },
    { key: 'venue_name', value: 'Salle des Fêtes' },
    { key: 'venue_address', value: 'Avenue de la Paix' },
    { key: 'venue_city', value: 'Kinshasa' },
    { key: 'venue_lat', value: '-4.4419' },
    { key: 'venue_lng', value: '15.2663' },
    { key: 'venue_parking', value: 'Parking gratuit disponible sur place' },
    { key: 'venue_time', value: '10h00' },
    { key: 'reception_venue', value: 'Salle des Fêtes — Grande Salle' },
    { key: 'contact_email', value: 'contact@alexandre-beatrice.wedding' },
    { key: 'contact_phone', value: '+243 800 000 000' },
    { key: 'rsvp_deadline', value: '2025-08-15' },
    { key: 'rsvp_message', value: 'Nous serions ravis de vous compter parmi nous pour célébrer notre union !' },
    { key: 'site_title', value: 'Mariage Alexandre & Béatrice' },
    { key: 'site_subtitle', value: '15 Septembre 2025' },
    { key: 'welcome_message', value: 'Bienvenue sur le site de notre mariage ! Nous sommes impatients de célébrer ce jour merveilleux avec vous.' },
    { key: 'thank_you_message', value: 'Merci d\'avoir partagé ce moment exceptionnel avec nous !' },
    { key: 'hashtag', value: '#AlexandreEtBeatrice2025' },
    { key: 'invitation_message', value: 'Vous êtes cordialement invité(e) à célébrer notre union. Votre présence est la plus belle des gifts.' },
  ]

  for (const setting of settings) {
    await db.settings.create({ data: setting })
  }
  console.log(`✅ Created ${settings.length} settings`)

  console.log('🎉 Seeding complete!')
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect())
