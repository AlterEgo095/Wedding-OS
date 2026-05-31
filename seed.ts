import { db } from './src/lib/db'
import { hashPassword } from './src/lib/auth'

async function seed() {
  console.log('🌱 Seeding database...')

  // Create Super Admin user
  const existingAdmin = await db.adminUser.findUnique({ where: { email: 'admin@wedding.com' } })
  if (!existingAdmin) {
    const hashedPassword = await hashPassword('admin123')
    await db.adminUser.create({
      data: {
        email: 'admin@wedding.com',
        password: hashedPassword,
        name: 'Admin Principal',
        role: 'SUPER_ADMIN',
      },
    })
    console.log('✅ Created Super Admin: admin@wedding.com / admin123')
  } else {
    console.log('⏭️  Super Admin already exists')
  }

  // Create an organizer
  const existingOrganizer = await db.adminUser.findUnique({ where: { email: 'organizer@wedding.com' } })
  if (!existingOrganizer) {
    const hashedPassword = await hashPassword('organizer123')
    await db.adminUser.create({
      data: {
        email: 'organizer@wedding.com',
        password: hashedPassword,
        name: 'Marie Organisatrice',
        role: 'ORGANIZER',
      },
    })
    console.log('✅ Created Organizer: organizer@wedding.com / organizer123')
  }

  // Create reception user
  const existingReception = await db.adminUser.findUnique({ where: { email: 'reception@wedding.com' } })
  if (!existingReception) {
    const hashedPassword = await hashPassword('reception123')
    await db.adminUser.create({
      data: {
        email: 'reception@wedding.com',
        password: hashedPassword,
        name: 'Paul Accueil',
        role: 'RECEPTION',
      },
    })
    console.log('✅ Created Reception: reception@wedding.com / reception123')
  }

  // Create tables
  const tableCount = await db.table.count()
  if (tableCount === 0) {
    const tableNames = [
      'Étoile', 'Lune', 'Soleil', 'Rose', 'Lys',
      'Orchidée', 'Jasmin', 'Pivoine', 'Hortensia', 'Tulipe',
      'Diamant', 'Saphir', 'Émeraude', 'Rubis', 'Opale',
    ]
    for (let i = 0; i < tableNames.length; i++) {
      await db.table.create({
        data: {
          name: tableNames[i],
          number: i + 1,
          capacity: i < 3 ? 10 : 8,
        },
      })
    }
    console.log('✅ Created 15 tables')
  }

  // Create guests
  const guestCount = await db.guest.count()
  if (guestCount === 0) {
    const guests = [
      { firstName: 'Alexandre', lastName: 'Dupont', category: 'VIP', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Béatrice', lastName: 'Laurent', category: 'VIP', status: 'CONFIRMED', seats: 1 },
      { firstName: 'Charles', lastName: 'Martin', category: 'FAMILLE', status: 'CONFIRMED', seats: 3 },
      { firstName: 'Diana', lastName: 'Moreau', category: 'FAMILLE', status: 'PENDING', seats: 2 },
      { firstName: 'Émile', lastName: 'Petit', category: 'FAMILLE', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Françoise', lastName: 'Roux', category: 'AMIS', status: 'CONFIRMED', seats: 1 },
      { firstName: 'Gabriel', lastName: 'Simon', category: 'AMIS', status: 'PENDING', seats: 2 },
      { firstName: 'Hélène', lastName: 'Bernard', category: 'AMIS', status: 'CONFIRMED', seats: 1 },
      { firstName: 'Isabelle', lastName: 'Leroy', category: 'AMIS', status: 'DECLINED', seats: 1 },
      { firstName: 'Jacques', lastName: 'Garnier', category: 'SPONSORS', status: 'CONFIRMED', seats: 4 },
      { firstName: 'Karine', lastName: 'Faure', category: 'SPONSORS', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Laurent', lastName: 'Mercier', category: 'COLLEGUES', status: 'PENDING', seats: 1 },
      { firstName: 'Marie', lastName: 'Blanc', category: 'COLLEGUES', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Nicolas', lastName: 'Guerin', category: 'COLLEGUES', status: 'PENDING', seats: 1 },
      { firstName: 'Odile', lastName: 'Muller', category: 'FAMILLE', status: 'CONFIRMED', seats: 3 },
      { firstName: 'Philippe', lastName: 'Lefevre', category: 'VIP', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Quentin', lastName: 'Roux', category: 'AMIS', status: 'PENDING', seats: 1 },
      { firstName: 'Renée', lastName: 'Fournier', category: 'FAMILLE', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Sophie', lastName: 'Girard', category: 'AMIS', status: 'CONFIRMED', seats: 1 },
      { firstName: 'Thierry', lastName: 'Bonnet', category: 'SPONSORS', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Ursule', lastName: 'Lambert', category: 'FAMILLE', status: 'DECLINED', seats: 1 },
      { firstName: 'Vincent', lastName: 'Fontaine', category: 'COLLEGUES', status: 'PENDING', seats: 1 },
      { firstName: 'Wendy', lastName: 'Dupuis', category: 'AMIS', status: 'CONFIRMED', seats: 2 },
      { firstName: 'Xavier', lastName: 'Riviere', category: 'VIP', status: 'CONFIRMED', seats: 1 },
      { firstName: 'Yvette', lastName: 'Caron', category: 'FAMILLE', status: 'PENDING', seats: 2 },
    ]

    const tables = await db.table.findMany({ orderBy: { number: 'asc' } })

    for (let i = 0; i < guests.length; i++) {
      const guest = guests[i]
      const table = tables[i % tables.length]
      const { v4: uuidv4 } = await import('uuid')

      await db.guest.create({
        data: {
          ...guest,
          invitationCode: uuidv4().substring(0, 8).toUpperCase(),
          tableId: table.id,
          phone: `+33 6 ${Math.floor(10000000 + Math.random() * 90000000)}`,
          email: `${guest.firstName.toLowerCase()}.${guest.lastName.toLowerCase()}@email.com`,
          checkedIn: guest.status === 'CONFIRMED' && Math.random() > 0.5,
        },
      })
    }
    console.log('✅ Created 25 guests')
  }

  // Create timeline events
  const timelineCount = await db.eventTimeline.count()
  if (timelineCount === 0) {
    const events = [
      { time: '14:00', activity: 'Accueil des invités', location: 'Hall principal', description: 'Cocktail de bienvenue', order: 0 },
      { time: '15:00', activity: 'Cérémonie laïque', location: 'Jardin', description: 'Échange des vœux', order: 1 },
      { time: '16:00', activity: 'Vin d\'honneur', location: 'Terrasse', description: 'Photos et animations', order: 2 },
      { time: '18:00', activity: 'Dîner', location: 'Grande salle', description: 'Repas assis', order: 3 },
      { time: '20:00', activity: 'Ouverture du bal', location: 'Piste de danse', description: 'Première danse des mariés', order: 4 },
      { time: '20:30', activity: 'Soirée dansante', location: 'Piste de danse', description: 'DJ et animations', order: 5 },
      { time: '23:00', activity: 'Feu d\'artifice', location: 'Jardin', description: 'Spectacle pyrotechnique', order: 6 },
      { time: '00:00', activity: 'Souper tardif', location: 'Buffet', description: 'Croque-monsieur et soupe à l\'oignon', order: 7 },
    ]

    for (const event of events) {
      await db.eventTimeline.create({ data: event })
    }
    console.log('✅ Created 8 timeline events')
  }

  // Create default settings
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) {
    const settings = [
      { key: 'groom_name', value: 'Alexandre' },
      { key: 'bride_name', value: 'Béatrice' },
      { key: 'couple_story', value: 'Un amour né sous le soleil de Provence...' },
      { key: 'wedding_date', value: '2025-09-15' },
      { key: 'wedding_time', value: '15:00' },
      { key: 'venue_name', value: 'Château de Versailles' },
      { key: 'venue_address', value: 'Place d\'Armes' },
      { key: 'venue_city', value: 'Versailles' },
      { key: 'reception_venue', value: 'Château de Versailles — Galerie des Glaces' },
      { key: 'contact_email', value: 'contact@alexandre-beatrice.wedding' },
      { key: 'contact_phone', value: '+33 1 23 45 67 89' },
      { key: 'rsvp_deadline', value: '2025-08-15' },
      { key: 'rsvp_message', value: 'Nous serions ravis de vous compter parmi nous !' },
      { key: 'site_title', value: 'Mariage Alexandre & Béatrice' },
      { key: 'site_subtitle', value: '15 Septembre 2025 — Versailles' },
      { key: 'welcome_message', value: 'Bienvenue sur le site de notre mariage' },
      { key: 'thank_you_message', value: 'Merci d\'avoir partagé ce moment avec nous' },
      { key: 'hashtag', value: '#AlexandreEtBeatrice' },
    ]

    for (const setting of settings) {
      await db.settings.create({ data: setting })
    }
    console.log('✅ Created 18 settings')
  }

  console.log('🎉 Seeding complete!')
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect())
