// ══════════════════════════════════════════════════════════════════════════════
// LES 12 THEME PACKAGES — Chaque thème est une identité complète
// ══════════════════════════════════════════════════════════════════════════════

import type { ThemePackage } from './theme-system'

// ─── Pattern generators ────────────────────────────────────────────────────
function pDots(c: string, s = 24, r = 1.5): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><circle cx='${s/2}' cy='${s/2}' r='${r}' fill='${c}' opacity='0.15'/></svg>`)}")`
}
function pLines(c: string, s = 20): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><path d='M0 ${s} L${s} 0' stroke='${c}' stroke-width='0.5' opacity='0.12'/></svg>`)}")`
}
function pKente(colors: string[]): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect x='0' y='0' width='20' height='20' fill='${colors[0]}' opacity='0.08'/><rect x='20' y='20' width='20' height='20' fill='${colors[1]}' opacity='0.08'/><rect x='10' y='10' width='20' height='20' fill='${colors[2]||colors[0]}' opacity='0.06'/></svg>`)}")`
}
function pWaves(c: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='20'><path d='M0 10 Q15 0 30 10 T60 10' stroke='${c}' stroke-width='0.8' fill='none' opacity='0.12'/></svg>`)}")`
}
function pLeaves(c: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><path d='M15 5 Q5 15 15 25 Q25 15 15 5' fill='${c}' opacity='0.1'/></svg>`)}")`
}
function pRays(c: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='40' cy='40' r='30' stroke='${c}' stroke-width='0.5' fill='none' opacity='0.1'/><circle cx='40' cy='40' r='20' stroke='${c}' stroke-width='0.5' fill='none' opacity='0.08'/></svg>`)}")`
}

// ══════════════════════════════════════════════════════════════════════════════
export const THEME_PACKAGES: ThemePackage[] = [
// ═══ 1. ROYAL GOLD ═════════════════════════════════════════════════════════
{
  slug: 'royal-gold',
  name: 'Royal Gold',
  category: 'LUXURY',
  tier: 'FREE',
  description: 'Or royal, noir nuit, Cormorant Garamond. Ambiance cinematic avec poussière dorée.',
  identity: {
    primary: '#D4AF37', primaryLight: '#E8C977', primaryDark: '#A8842A',
    accent: '#1a1a2e', accentLight: '#2a2a4e',
    surface: '#0a0a0a', surfaceDeep: '#050505',
    text: '#FAF8F5', textMuted: '#8a8a8a',
    fontDisplay: 'Cormorant Garamond', fontBody: 'Inter',
    displayWeight: '700', bodyWeight: '400',
    pattern: pDots('#D4AF37', 24, 1.5),
    ambiance: 'radial-gradient(ellipse at top, rgba(212,175,55,0.08), transparent 60%), linear-gradient(180deg, #0a0a0a, #050505)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Inter:wght@300;400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'cinematic-parallax', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'masonry', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'cinematic-zoom', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'classic-card', rsvpStyle: 'inline-form', qrStyle: 'gold-ornate', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Alexandre', brideName: 'Céleste',
    groomInitial: 'A', brideInitial: 'C',
    weddingDate: 'Samedi 12 Septembre 2026', weddingDateShort: '12.09.2026',
    venue: 'Château de Lumière', venueCity: 'Versailles, France', venueAddress: '1 Avenue du Crépuscule, 78000',
    hashtag: '#AlexandreEtCéleste', heroImage: '/aenws/themes/royal-gold.png',
    story: [
      { id: 's1', title: 'La Première Rencontre', date: 'Printemps 2022', description: 'Un café partagé à Versailles. Deux inconnus, une conversation sans fin.', side: 'left' },
      { id: 's2', title: 'La Demande', date: 'Été 2025', description: 'Au coucher du soleil, dans un champ de blé doré. Le temps s\'est arrêté.', side: 'right' },
      { id: 's3', title: 'Aujourd\'hui', date: 'Septembre 2026', description: 'Deux cheminements qui n\'en font plus qu\'un.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '15:00', title: 'Cérémonie Laïque', location: 'Jardin des Roses', description: 'Échange des vœux sous l\'arche fleurie.', icon: 'rings' },
      { id: 't2', time: '16:30', title: 'Vin d\'Honneur', location: 'Terrasse Sud', description: 'Champagne et amuse-bouches signature.', icon: 'champagne' },
      { id: 't3', time: '19:00', title: 'Dîner de Gala', location: 'Grand Salon', description: 'Dîner gastronomique en six services.', icon: 'dinner' },
      { id: 't4', time: '22:00', title: 'Ouverture de Piste', location: 'Salle de Bal', description: 'Première danse des mariés.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Les alliances', span: 'normal' },
      { id: 'g2', caption: 'Le bouquet', span: 'tall' },
      { id: 'g3', caption: 'Le lieu', span: 'wide' },
      { id: 'g4', caption: 'La réception', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 2. ROYAL BLACK ════════════════════════════════════════════════════════
{
  slug: 'royal-black',
  name: 'Royal Black',
  category: 'LUXURY',
  tier: 'PREMIUM',
  description: 'Noir profond et or vieilli, Playfair Display. Ambiance théâtrale dramatique.',
  identity: {
    primary: '#C9A961', primaryLight: '#D4B876', primaryDark: '#9A8048',
    accent: '#0a0a0a', accentLight: '#1a1a1a',
    surface: '#000000', surfaceDeep: '#000000',
    text: '#E8E0D0', textMuted: '#7a7570',
    fontDisplay: 'Playfair Display', fontBody: 'Montserrat',
    displayWeight: '700', bodyWeight: '300',
    pattern: pRays('#C9A961'),
    ambiance: 'radial-gradient(ellipse at center, rgba(201,169,97,0.06), transparent 70%), linear-gradient(180deg, #000000, #0a0a0a)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Montserrat:wght@300;400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'cinematic-parallax', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'grid-uniform', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'cinematic-zoom', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'envelope-luxury', rsvpStyle: 'modal-dialog', qrStyle: 'gold-ornate', shareStyle: 'link-elegant' },
  demo: {
    groomName: 'James', brideName: 'Victoria',
    groomInitial: 'J', brideInitial: 'V',
    weddingDate: 'Samedi 24 Octobre 2026', weddingDateShort: '24.10.2026',
    venue: 'Palais Vendôme', venueCity: 'Paris, France', venueAddress: '17 Place Vendôme, 75001',
    hashtag: '#JamesEtVictoria', heroImage: '/aenws/themes/royal-black.png',
    story: [
      { id: 's1', title: 'Une Rencontre Inattendue', date: 'Hiver 2023', description: 'Lors d\'une soirée de gala à Paris. Un regard à travers la salle.', side: 'left' },
      { id: 's2', title: 'La Promesse', date: 'Noël 2025', description: 'Sous les lumières de Paris, près de la Tour Eiffel scintillante.', side: 'right' },
      { id: 's3', title: 'L\'Éternité', date: 'Octobre 2026', description: 'Un mariage d\'exception au cœur de la capitale.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '18:00', title: 'Cérémonie', location: 'Salon Doré', description: 'Cérémonie intime aux chandelles.', icon: 'rings' },
      { id: 't2', time: '19:30', title: 'Cocktail', location: 'Galerie des Glaces', description: 'Réception au champagne.', icon: 'champagne' },
      { id: 't3', time: '21:00', title: 'Dîner', location: 'Salle Vendôme', description: 'Dîner gastronomique sept services.', icon: 'dinner' },
      { id: 't4', time: '23:30', title: 'Bal', location: 'Salle de Bal', description: 'Valse d\'ouverture et soirée dansante.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'L\'engagement', span: 'tall' },
      { id: 'g2', caption: 'La robe', span: 'normal' },
      { id: 'g3', caption: 'Le palais', span: 'wide' },
      { id: 'g4', caption: 'Les détails', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 3. SAPPHIRE NOIR ══════════════════════════════════════════════════════
{
  slug: 'sapphire-noir',
  name: 'Sapphire Noir',
  category: 'LUXURY',
  tier: 'PREMIUM',
  description: 'Saphir profond, or champagne et noir velouté. Élégance intemporelle.',
  identity: {
    primary: '#C9A961', primaryLight: '#DBC285', primaryDark: '#9A8048',
    accent: '#0D1B2A', accentLight: '#1B2D45',
    surface: '#050A14', surfaceDeep: '#020509',
    text: '#E8E4DC', textMuted: '#6B7894',
    fontDisplay: 'Playfair Display', fontBody: 'Inter',
    displayWeight: '600', bodyWeight: '400',
    pattern: pDots('#C9A961', 32, 1),
    ambiance: 'radial-gradient(ellipse at top right, rgba(13,27,42,0.6), transparent 50%), radial-gradient(ellipse at bottom left, rgba(201,169,97,0.08), transparent 60%), linear-gradient(180deg, #050A14, #020509)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'cinematic-parallax', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'masonry', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'cinematic-zoom', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'envelope-luxury', rsvpStyle: 'modal-dialog', qrStyle: 'gold-ornate', shareStyle: 'link-elegant' },
  demo: {
    groomName: 'Édouard', brideName: 'Isabella',
    groomInitial: 'É', brideInitial: 'I',
    weddingDate: 'Vendredi 18 Décembre 2026', weddingDateShort: '18.12.2026',
    venue: 'Hôtel Sapphire', venueCity: 'Monaco', venueAddress: '2 Avenue de la Costa, 98000',
    hashtag: '#ÉdouardEtIsabella', heroImage: '/aenws/themes/sapphire-noir.png',
    story: [
      { id: 's1', title: 'Monte Carlo', date: 'Été 2023', description: 'Une rencontre sur la Côte d\'Azur, lors d\'une soirée privée.', side: 'left' },
      { id: 's2', title: 'Le Saphir', date: 'Janvier 2026', description: 'Une bague saphir, un yacht au large de Monaco.', side: 'right' },
      { id: 's3', title: 'L\'Éternité', date: 'Décembre 2026', description: 'Une célébration d\'exception au cœur de Monaco.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '17:00', title: 'Cérémonie', location: 'Terrasse Méditerranée', description: 'Vœux au coucher de soleil sur la mer.', icon: 'rings' },
      { id: 't2', time: '18:30', title: 'Réception', location: 'Salle Saphir', description: 'Champagne et caviar.', icon: 'champagne' },
      { id: 't3', time: '20:00', title: 'Gala', location: 'Salle de Bal', description: 'Dîner noir-tie sept services.', icon: 'dinner' },
      { id: 't4', time: '23:00', title: 'Soirée', location: 'Sky Lounge', description: 'DJ set et danse jusqu\'à l\'aube.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Le saphir', span: 'normal' },
      { id: 'g2', caption: 'La Méditerranée', span: 'wide' },
      { id: 'g3', caption: 'L\'élégance', span: 'tall' },
      { id: 'g4', caption: 'Monaco', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 4. CONGO PRESTIGE ═════════════════════════════════════════════════════
{
  slug: 'congo-prestige',
  name: 'Congo Prestige',
  category: 'AFRICAN',
  tier: 'EXCLUSIVE',
  description: 'Rouge et or ciel, inspiration drapeau RDC. Ambiance dorée intense et faste congolais.',
  identity: {
    primary: '#FFD700', primaryLight: '#FFE45C', primaryDark: '#C9A800',
    accent: '#C41E3A', accentLight: '#E63946',
    surface: '#1a0505', surfaceDeep: '#0a0202',
    text: '#FFE8D6', textMuted: '#A08070',
    fontDisplay: 'Cormorant Garamond', fontBody: 'Inter',
    displayWeight: '700', bodyWeight: '400',
    pattern: pKente(['#FFD700', '#C41E3A', '#0a7d2c']),
    ambiance: 'radial-gradient(ellipse at center, rgba(255,215,0,0.1), transparent 60%), linear-gradient(180deg, #1a0505, #0a0202)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Inter:wght@400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'african-regal', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'masonry', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'cinematic-zoom', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'african-vibrant', rsvpStyle: 'inline-form', qrStyle: 'colorful-frame', shareStyle: 'social-cards' },
  demo: {
    groomName: 'David', brideName: 'Grâce',
    groomInitial: 'D', brideInitial: 'G',
    weddingDate: 'Samedi 5 Décembre 2026', weddingDateShort: '05.12.2026',
    venue: 'Palais de la Nation', venueCity: 'Kinshasa, RDC', venueAddress: 'Boulevard du 30 Juin, Gombe',
    hashtag: '#DavidEtGrâce', heroImage: '/aenws/themes/congo-prestige.png',
    story: [
      { id: 's1', title: 'Kinshasa la Belle', date: 'Été 2022', description: 'Une rencontre à Kinshasa lors d\'un événement familial. Le destin a parlé.', side: 'left' },
      { id: 's2', title: 'La Demande', date: 'Décembre 2025', description: 'Sous les lumières de Noël, entouré des deux familles. Une cérémonie tradition.', side: 'right' },
      { id: 's3', title: 'La Célébration', date: 'Décembre 2026', description: 'Un mariage fastueux réunissant tout le prestige congolais.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '10:00', title: 'Cérémonie Traditionnelle', location: 'Cour du Palais', description: 'Dot et cérémonie coutumière selon la tradition.', icon: 'rings' },
      { id: 't2', time: '14:00', title: 'Cérémonie Religieuse', location: 'Cathédrale', description: 'Bénédiction nuptiale solennelle.', icon: 'rings' },
      { id: 't3', time: '17:00', title: 'Vin d\'Honneur', location: 'Jardin Royal', description: 'Cocktail fastueux et spectacle traditionnel.', icon: 'champagne' },
      { id: 't4', time: '20:00', title: 'Réception', location: 'Salle de Gala', description: 'Dîner de gala et soirée dansante mbalax.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'La tradition', span: 'tall' },
      { id: 'g2', caption: 'Les couleurs', span: 'normal' },
      { id: 'g3', caption: 'Le faste', span: 'wide' },
      { id: 'g4', caption: 'La famille', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 5. KENTE ══════════════════════════════════════════════════════════════
{
  slug: 'kente',
  name: 'Kente',
  category: 'AFRICAN',
  tier: 'PREMIUM',
  description: 'Orange et vert profond, inspiration tissu traditionnel ghanéen. Héritage et chaleur.',
  identity: {
    primary: '#E8A53D', primaryLight: '#F0BC65', primaryDark: '#B07D2A',
    accent: '#1B5E20', accentLight: '#2E7D32',
    surface: '#1a1505', surfaceDeep: '#0d0a02',
    text: '#FFF3E0', textMuted: '#9A8B70',
    fontDisplay: 'Playfair Display', fontBody: 'Montserrat',
    displayWeight: '700', bodyWeight: '400',
    pattern: pKente(['#E8A53D', '#1B5E20', '#C41E3A']),
    ambiance: 'radial-gradient(ellipse at top, rgba(232,165,61,0.12), transparent 60%), linear-gradient(180deg, #1a1505, #0d0a02)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Montserrat:wght@400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'african-regal', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'masonry', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'alternating', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'cinematic-zoom', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'african-vibrant', rsvpStyle: 'inline-form', qrStyle: 'colorful-frame', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Kwame', brideName: 'Ama',
    groomInitial: 'K', brideInitial: 'A',
    weddingDate: 'Samedi 28 Novembre 2026', weddingDateShort: '28.11.2026',
    venue: 'Manhyia Palace', venueCity: 'Kumasi, Ghana', venueAddress: 'Manhyia Palace Road',
    hashtag: '#KwameEtAma', heroImage: '/aenws/themes/kente.png',
    story: [
      { id: 's1', title: 'Accra', date: 'Printemps 2022', description: 'Une rencontre à Accra lors d\'un festival culturel Ashanti.', side: 'left' },
      { id: 's2', title: 'La Tradition', date: 'Été 2025', description: 'Cérémonie de demande traditionnelle avec les deux familles.', side: 'right' },
      { id: 's3', title: 'L\'Union', date: 'Novembre 2026', description: 'Un mariage célébré selon les rites Ashanti à Kumasi.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '09:00', title: 'Cérémonie de Dot', location: 'Palais Royal', description: 'Knocking ceremony traditionnelle Ashanti.', icon: 'rings' },
      { id: 't2', time: '12:00', title: 'Bénédiction', location: 'Palais Manhyia', description: 'Bénédiction des aînés et des familles.', icon: 'rings' },
      { id: 't3', time: '15:00', title: 'Réception', location: 'Jardin du Palais', description: 'Banquet traditionnel avec highlife music.', icon: 'dinner' },
      { id: 't4', time: '19:00', title: 'Fête', location: 'Salle Kente', description: 'Soirée dansante avec percussions.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Le Kente', span: 'normal' },
      { id: 'g2', caption: 'La tradition', span: 'tall' },
      { id: 'g3', caption: 'Kumasi', span: 'wide' },
      { id: 'g4', caption: 'La célébration', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 6. WHITE ROMANCE ══════════════════════════════════════════════════════
{
  slug: 'white-romance',
  name: 'White Romance',
  category: 'CLASSIC',
  tier: 'FREE',
  description: 'Crème et bronze, Cormorant Garamond. Romance intemporelle et douce.',
  identity: {
    primary: '#8B6F47', primaryLight: '#A8895C', primaryDark: '#6B5535',
    accent: '#F5E6D3', accentLight: '#FAF0E0',
    surface: '#FAF6F0', surfaceDeep: '#F0E8DC',
    text: '#3D2B1F', textMuted: '#7A6B5A',
    fontDisplay: 'Cormorant Garamond', fontBody: 'Lato',
    displayWeight: '700', bodyWeight: '400',
    pattern: pDots('#8B6F47', 24, 1),
    ambiance: 'radial-gradient(ellipse at top, rgba(139,111,71,0.06), transparent 60%), linear-gradient(180deg, #FAF6F0, #F0E8DC)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Lato:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'split-overlay', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'grid-uniform', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'vertical-list', enabled: true, order: 3 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'envelope', enabled: true, order: 4 },
  ],
  invitation: { template: 'classic-card', rsvpStyle: 'inline-form', qrStyle: 'minimal-monochrome', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Thomas', brideName: 'Marguerite',
    groomInitial: 'T', brideInitial: 'M',
    weddingDate: 'Dimanche 7 Juin 2026', weddingDateShort: '07.06.2026',
    venue: 'Domaine de la Rose', venueCity: 'Grasse, France', venueAddress: 'Chemin des Roses, 06130',
    hashtag: '#ThomasEtMarguerite', heroImage: '/aenws/themes/white-romance.png',
    story: [
      { id: 's1', title: 'Provence', date: 'Été 2022', description: 'Une rencontre dans les champs de lavande de Provence.', side: 'left' },
      { id: 's2', title: 'La Demande', date: 'Printemps 2025', description: 'Sous un rosier en fleurs au Domaine de la Rose.', side: 'right' },
      { id: 's3', title: 'Pour la Vie', date: 'Juin 2026', description: 'Un mariage romantique au pays des roses.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '14:00', title: 'Cérémonie', location: 'Jardin de Roses', description: 'Cérémonie laïque au milieu des rosiers.', icon: 'rings' },
      { id: 't2', time: '15:30', title: 'Vin d\'Honneur', location: 'Terrasse', description: 'Thé, café et pâtisseries fines.', icon: 'champagne' },
      { id: 't3', time: '18:00', title: 'Dîner', location: 'Salle Marguerite', description: 'Dîner romantique aux chandelles.', icon: 'dinner' },
      { id: 't4', time: '21:00', title: 'Soirée', location: 'Jardin', description: 'Danse sous les étoiles.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Les roses', span: 'normal' },
      { id: 'g2', caption: 'La robe', span: 'tall' },
      { id: 'g3', caption: 'Le domaine', span: 'wide' },
      { id: 'g4', caption: 'Le bouquet', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
},

// ═══ 7. ELEGANT BEIGE ══════════════════════════════════════════════════════
{
  slug: 'elegant-beige',
  name: 'Elegant Beige',
  category: 'CLASSIC',
  tier: 'FREE',
  description: 'Tons neutres et naturels, typographie raffinée. Élégance feutrée et chaleureuse.',
  identity: {
    primary: '#5C4033', primaryLight: '#7A5644', primaryDark: '#3D2820',
    accent: '#D4C5B0', accentLight: '#E0D2BC',
    surface: '#EDE5D8', surfaceDeep: '#E0D5C2',
    text: '#2D1F15', textMuted: '#6B5A4A',
    fontDisplay: 'Cormorant Garamond', fontBody: 'Open Sans',
    displayWeight: '700', bodyWeight: '400',
    pattern: pLines('#5C4033', 24),
    ambiance: 'radial-gradient(ellipse at top, rgba(92,64,51,0.05), transparent 60%), linear-gradient(180deg, #EDE5D8, #E0D5C2)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Open+Sans:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'split-overlay', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 1 },
    { id: 'gallery', type: 'gallery', variant: 'grid-uniform', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'vertical-list', enabled: true, order: 3 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'envelope', enabled: true, order: 4 },
  ],
  invitation: { template: 'classic-card', rsvpStyle: 'inline-form', qrStyle: 'minimal-monochrome', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Henri', brideName: 'Camille',
    groomInitial: 'H', brideInitial: 'C',
    weddingDate: 'Samedi 20 Juin 2026', weddingDateShort: '20.06.2026',
    venue: 'Maison de Campagne', venueCity: 'Bourgogne, France', venueAddress: 'Le Hameau, 21200',
    hashtag: '#HenriEtCamille', heroImage: '/aenws/themes/elegant-beige.png',
    story: [
      { id: 's1', title: 'Bourgogne', date: 'Automne 2022', description: 'Une rencontre lors d\'une dégustation en Bourgogne.', side: 'left' },
      { id: 's2', title: 'La Demande', date: 'Été 2025', description: 'Dans les vignes au coucher du soleil.', side: 'right' },
      { id: 's3', title: 'L\'Union', date: 'Juin 2026', description: 'Un mariage champêtre élégant en Bourgogne.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '15:00', title: 'Cérémonie', location: 'Jardin', description: 'Cérémonie laïque dans le parc.', icon: 'rings' },
      { id: 't2', time: '16:30', title: 'Apéritif', location: 'Terrasse', description: 'Vin de Bourgogne et amuse-bouches.', icon: 'champagne' },
      { id: 't3', time: '19:00', title: 'Dîner', location: 'Grange Aménagée', description: 'Dîner gastronomique terroir.', icon: 'dinner' },
      { id: 't4', time: '22:00', title: 'Soirée', location: 'Cour', description: 'Danse et feu de joie.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Les vignes', span: 'wide' },
      { id: 'g2', caption: 'La maison', span: 'normal' },
      { id: 'g3', caption: 'Le terroir', span: 'normal' },
      { id: 'g4', caption: 'L\'élégance', span: 'tall' },
    ],
  },
  features: ['Hero', 'Story', 'Gallery', 'Timeline', 'RSVP'],
},

// ═══ 8. PURE WHITE ═════════════════════════════════════════════════════════
{
  slug: 'pure-white',
  name: 'Pure White',
  category: 'MINIMAL',
  tier: 'FREE',
  description: 'Blanc et gris anthracite, Montserrat. Pureté minimale, ambiance champagne.',
  identity: {
    primary: '#2C2C2C', primaryLight: '#4A4A4A', primaryDark: '#1A1A1A',
    accent: '#FFFFFF', accentLight: '#F5F5F5',
    surface: '#FFFFFF', surfaceDeep: '#F0F0F0',
    text: '#1A1A1A', textMuted: '#7A7A7A',
    fontDisplay: 'Montserrat', fontBody: 'Inter',
    displayWeight: '300', bodyWeight: '400',
    pattern: pDots('#2C2C2C', 32, 0.5),
    ambiance: 'linear-gradient(180deg, #FFFFFF, #F0F0F0)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400&family=Inter:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'minimal-center', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'scroll-narrative', enabled: true, order: 1 },
    { id: 'timeline', type: 'timeline', variant: 'vertical-list', enabled: true, order: 2 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'minimal-form', enabled: true, order: 3 },
  ],
  invitation: { template: 'minimal-digital', rsvpStyle: 'inline-form', qrStyle: 'minimal-monochrome', shareStyle: 'link-elegant' },
  demo: {
    groomName: 'Liam', brideName: 'Sophia',
    groomInitial: 'L', brideInitial: 'S',
    weddingDate: 'Samedi 11 Juillet 2026', weddingDateShort: '11.07.2026',
    venue: 'Loft Minimal', venueCity: 'Copenhague, Danemark', venueAddress: 'Strandgade 27, 1401',
    hashtag: '#LiamEtSophia', heroImage: '/aenws/themes/pure-white.png',
    story: [
      { id: 's1', title: 'Copenhague', date: 'Hiver 2023', description: 'Une rencontre dans un café minimaliste de Copenhague.', side: 'left' },
      { id: 's2', title: 'La Promesse', date: 'Printemps 2026', description: 'Une promenade au bord du canal, un anneau simple.', side: 'right' },
      { id: 's3', title: 'La Simplicité', date: 'Juillet 2026', description: 'Un mariage épuré, centré sur l\'essentiel.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '14:00', title: 'Cérémonie', location: 'Loft', description: 'Cérémonie civile minimaliste.', icon: 'rings' },
      { id: 't2', time: '15:00', title: 'Toast', location: 'Terrasse', description: 'Toast au champagne.', icon: 'champagne' },
      { id: 't3', time: '17:00', title: 'Dîner', location: 'Table Commune', description: 'Dîner partagé à grande table.', icon: 'dinner' },
      { id: 't4', time: '20:00', title: 'Soirée', location: 'Loft', description: 'Soirée intime et musicale.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'La simplicité', span: 'normal' },
      { id: 'g2', caption: 'Le loft', span: 'wide' },
      { id: 'g3', caption: 'Le détail', span: 'normal' },
    ],
  },
  features: ['Hero', 'Story', 'Timeline', 'RSVP'],
},

// ═══ 9. NORDIC ═════════════════════════════════════════════════════════════
{
  slug: 'nordic',
  name: 'Nordic',
  category: 'MINIMAL',
  tier: 'FREE',
  description: 'Bleu pâle et blanc, inspiration scandinave. Sérénité et midnight sun.',
  identity: {
    primary: '#5A7A9A', primaryLight: '#7A9AB0', primaryDark: '#3A5A7A',
    accent: '#FFFFFF', accentLight: '#F0F4F8',
    surface: '#E8EEF4', surfaceDeep: '#D8E0E8',
    text: '#1A2A3A', textMuted: '#6A7A8A',
    fontDisplay: 'Montserrat', fontBody: 'Inter',
    displayWeight: '300', bodyWeight: '400',
    pattern: pLines('#5A7A9A', 30),
    ambiance: 'radial-gradient(ellipse at top, rgba(90,122,154,0.08), transparent 60%), linear-gradient(180deg, #E8EEF4, #D8E0E8)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400&family=Inter:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'minimal-center', enabled: true, order: 0 },
    { id: 'story', type: 'story', variant: 'scroll-narrative', enabled: true, order: 1 },
    { id: 'timeline', type: 'timeline', variant: 'vertical-list', enabled: true, order: 2 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'minimal-form', enabled: true, order: 3 },
  ],
  invitation: { template: 'minimal-digital', rsvpStyle: 'inline-form', qrStyle: 'minimal-monochrome', shareStyle: 'link-elegant' },
  demo: {
    groomName: 'Lars', brideName: 'Astrid',
    groomInitial: 'L', brideInitial: 'A',
    weddingDate: 'Samedi 27 Juin 2026', weddingDateShort: '27.06.2026',
    venue: 'Fjord House', venueCity: 'Bergen, Norvège', venueAddress: 'Bryggen 14, 5003',
    hashtag: '#LarsEtAstrid', heroImage: '/aenws/themes/nordic.png',
    story: [
      { id: 's1', title: 'Bergen', date: 'Été 2023', description: 'Une rencontre sur les quais de Bergen, sous le soleil de minuit.', side: 'left' },
      { id: 's2', title: 'Le Fjord', date: 'Été 2025', description: 'Une promenade en bateau sur le Sognefjord, une bague.', side: 'right' },
      { id: 's3', title: 'Le Soleil de Minuit', date: 'Juin 2026', description: 'Un mariage sous la lumière scandinave éternelle.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '13:00', title: 'Cérémonie', location: 'Terrasse Fjord', description: 'Cérémonie face au fjord.', icon: 'rings' },
      { id: 't2', time: '14:30', title: 'Réception', location: 'Jardin', description: 'Toast au vin chaud et aquavit.', icon: 'champagne' },
      { id: 't3', time: '17:00', title: 'Dîner', location: 'Salle Nordique', description: 'Dîner scandinave à base de saumon.', icon: 'dinner' },
      { id: 't4', time: '21:00', title: 'Soirée', location: 'Quai', description: 'Feu de camp au bord de l\'eau.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Le fjord', span: 'wide' },
      { id: 'g2', caption: 'Bergen', span: 'normal' },
      { id: 'g3', caption: 'La lumière', span: 'tall' },
    ],
  },
  features: ['Hero', 'Story', 'Timeline', 'RSVP'],
},

// ═══ 10. BEACH ═════════════════════════════════════════════════════════════
{
  slug: 'beach',
  name: 'Beach',
  category: 'DESTINATION',
  tier: 'FREE',
  description: 'Turquoise et sable, Pacifico décontractée. Évasion plage et resort.',
  identity: {
    primary: '#4FC3F7', primaryLight: '#80D4F8', primaryDark: '#29B6F6',
    accent: '#F5E6D3', accentLight: '#FAF0E0',
    surface: '#E0F4FA', surfaceDeep: '#C8EAF5',
    text: '#0D4A5C', textMuted: '#5A8090',
    fontDisplay: 'Pacifico', fontBody: 'Lato',
    displayWeight: '400', bodyWeight: '400',
    pattern: pWaves('#4FC3F7'),
    ambiance: 'radial-gradient(ellipse at top, rgba(79,195,247,0.12), transparent 60%), linear-gradient(180deg, #E0F4FA, #C8EAF5)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Pacifico&family=Lato:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'destination-full', enabled: true, order: 0 },
    { id: 'gallery', type: 'gallery', variant: 'polaroid', enabled: true, order: 1 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'card-stack', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'full-bleed', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'envelope', enabled: true, order: 5 },
  ],
  invitation: { template: 'tropical-postcard', rsvpStyle: 'inline-form', qrStyle: 'colorful-frame', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Tom', brideName: 'Sarah',
    groomInitial: 'T', brideInitial: 'S',
    weddingDate: 'Samedi 15 Août 2026', weddingDateShort: '15.08.2026',
    venue: 'Tropical Bay Resort', venueCity: 'Zanzibar, Tanzanie', venueAddress: 'Kendwa Beach',
    hashtag: '#TomEtSarah', heroImage: '/aenws/themes/beach.png',
    story: [
      { id: 's1', title: 'Zanzibar', date: 'Hiver 2023', description: 'Une rencontre sur la plage de Kendwa, pieds nus dans le sable.', side: 'left' },
      { id: 's2', title: 'Le Coucher de Soleil', date: 'Été 2025', description: 'Une demande en mariage au coucher du soleil sur l\'océan Indien.', side: 'right' },
      { id: 's3', title: 'L\'Évasion', date: 'Août 2026', description: 'Un mariage tropical les pieds dans l\'eau.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '16:00', title: 'Cérémonie', location: 'Plage', description: 'Cérémonie pieds nus sur le sable.', icon: 'rings' },
      { id: 't2', time: '17:30', title: 'Cocktail', location: 'Bar de Plage', description: 'Cocktails tropicaux au coucher du soleil.', icon: 'champagne' },
      { id: 't3', time: '19:30', title: 'Dîner', location: 'Terrasse Océan', description: 'Dîner de fruits de mer face au lagon.', icon: 'dinner' },
      { id: 't4', time: '22:00', title: 'Fête', location: 'Plage', description: 'Soirée dansante sur la plage.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Le lagon', span: 'wide' },
      { id: 'g2', caption: 'Le sable', span: 'normal' },
      { id: 'g3', caption: 'Le coucher', span: 'tall' },
      { id: 'g4', caption: 'Les palmiers', span: 'normal' },
    ],
  },
  features: ['Hero', 'Gallery', 'Story', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 11. GARDEN ════════════════════════════════════════════════════════════
{
  slug: 'garden',
  name: 'Garden',
  category: 'DESTINATION',
  tier: 'FREE',
  description: 'Vert jardin et crème florale, inspiration botanique. Ambiance champêtre.',
  identity: {
    primary: '#558B2F', primaryLight: '#7AB040', primaryDark: '#3D6B1F',
    accent: '#FFF8E1', accentLight: '#FFFCF0',
    surface: '#F1F8E9', surfaceDeep: '#E0F0D0',
    text: '#1B3A0A', textMuted: '#5A7A4A',
    fontDisplay: 'Cormorant Garamond', fontBody: 'Lato',
    displayWeight: '700', bodyWeight: '400',
    pattern: pLeaves('#558B2F'),
    ambiance: 'radial-gradient(ellipse at top, rgba(85,139,47,0.08), transparent 60%), linear-gradient(180deg, #F1F8E9, #E0F0D0)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Lato:wght@300;400&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'destination-full', enabled: true, order: 0 },
    { id: 'gallery', type: 'gallery', variant: 'polaroid', enabled: true, order: 1 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'card-stack', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'full-bleed', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'envelope', enabled: true, order: 5 },
  ],
  invitation: { template: 'tropical-postcard', rsvpStyle: 'inline-form', qrStyle: 'colorful-frame', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Oliver', brideName: 'Hazel',
    groomInitial: 'O', brideInitial: 'H',
    weddingDate: 'Samedi 30 Mai 2026', weddingDateShort: '30.05.2026',
    venue: 'Jardin Botanique', venueCity: 'Cotswolds, UK', venueAddress: 'Bourton-on-the-Water',
    hashtag: '#OliverEtHazel', heroImage: '/aenws/themes/garden.png',
    story: [
      { id: 's1', title: 'Cotswolds', date: 'Printemps 2022', description: 'Une rencontre dans les jardins de Cotswolds en fleurs.', side: 'left' },
      { id: 's2', title: 'La Promesse', date: 'Été 2025', description: 'Une promesse échangée au milieu des roses anglaises.', side: 'right' },
      { id: 's3', title: 'La Floraison', date: 'Mai 2026', description: 'Un mariage en plein épanouissement printanier.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '13:00', title: 'Cérémonie', location: 'Roseraie', description: 'Cérémonie au milieu des fleurs.', icon: 'rings' },
      { id: 't2', time: '14:30', title: 'Garden Party', location: 'Jardin', description: 'Garden party traditionnelle anglaise.', icon: 'champagne' },
      { id: 't3', time: '17:00', title: 'Thé', location: 'Véranda', description: 'Afternoon tea et gâteaux.', icon: 'dinner' },
      { id: 't4', time: '20:00', title: 'Soirée', location: 'Serre', description: 'Dîner et danse dans la serre.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Les fleurs', span: 'tall' },
      { id: 'g2', caption: 'Le jardin', span: 'wide' },
      { id: 'g3', caption: 'La serre', span: 'normal' },
      { id: 'g4', caption: 'Les roses', span: 'normal' },
    ],
  },
  features: ['Hero', 'Gallery', 'Story', 'Timeline', 'Map', 'RSVP'],
},

// ═══ 12. SUNSET ════════════════════════════════════════════════════════════
{
  slug: 'sunset',
  name: 'Sunset',
  category: 'DESTINATION',
  tier: 'PREMIUM',
  description: 'Orange et jaune doré, ambiance golden hour. Luxe rose vibrant et chaleur.',
  identity: {
    primary: '#FF6B6B', primaryLight: '#FF8E8E', primaryDark: '#E04848',
    accent: '#FFD93D', accentLight: '#FFE066',
    surface: '#FFF4E6', surfaceDeep: '#FFE8CC',
    text: '#4A1A0A', textMuted: '#8A5A4A',
    fontDisplay: 'Playfair Display', fontBody: 'Montserrat',
    displayWeight: '700', bodyWeight: '400',
    pattern: pRays('#FF6B6B'),
    ambiance: 'radial-gradient(ellipse at top, rgba(255,107,107,0.12), transparent 60%), radial-gradient(ellipse at bottom, rgba(255,217,61,0.08), transparent 60%), linear-gradient(180deg, #FFF4E6, #FFE8CC)',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Montserrat:wght@400;500&display=swap',
  },
  sections: [
    { id: 'hero', type: 'hero', variant: 'destination-full', enabled: true, order: 0 },
    { id: 'gallery', type: 'gallery', variant: 'carousel', enabled: true, order: 1 },
    { id: 'story', type: 'story', variant: 'chapters', enabled: true, order: 2 },
    { id: 'timeline', type: 'timeline', variant: 'card-stack', enabled: true, order: 3 },
    { id: 'map', type: 'map', variant: 'full-bleed', enabled: true, order: 4 },
    { id: 'guest-auth', type: 'guest-auth', variant: 'glass-portal', enabled: true, order: 5 },
  ],
  invitation: { template: 'tropical-postcard', rsvpStyle: 'modal-dialog', qrStyle: 'colorful-frame', shareStyle: 'social-cards' },
  demo: {
    groomName: 'Marco', brideName: 'Elena',
    groomInitial: 'M', brideInitial: 'E',
    weddingDate: 'Samedi 22 Août 2026', weddingDateShort: '22.08.2026',
    venue: 'Villa del Sole', venueCity: 'Amalfi, Italie', venueAddress: 'Via Costiera Amalfitana',
    hashtag: '#MarcoEtElena', heroImage: '/aenws/themes/sunset.png',
    story: [
      { id: 's1', title: 'Amalfi', date: 'Été 2023', description: 'Une rencontre sur la Costa Amalfitana, sous le soleil italien.', side: 'left' },
      { id: 's2', title: 'Le Coucher de Soleil', date: 'Été 2025', description: 'Une demande à Positano, face au coucher de soleil doré.', side: 'right' },
      { id: 's3', title: 'La Dolce Vita', date: 'Août 2026', description: 'Un mariage méditerranéen vibrant et chaleureux.', side: 'left' },
    ],
    timeline: [
      { id: 't1', time: '17:00', title: 'Cérémonie', location: 'Terrasse Méditerranée', description: 'Vœux face à la mer Tyrrhénienne.', icon: 'rings' },
      { id: 't2', time: '18:30', title: 'Aperitivo', location: 'Jardin', description: 'Aperitivo italiano au coucher de soleil.', icon: 'champagne' },
      { id: 't3', time: '20:00', title: 'Dîner', location: 'Terrasse', description: 'Dîner méditerranéen sous les étoiles.', icon: 'dinner' },
      { id: 't4', time: '22:30', title: 'Festa', location: 'Piazza', description: 'Festa italiana jusqu\'au bout de la nuit.', icon: 'dance' },
    ],
    gallery: [
      { id: 'g1', caption: 'Amalfi', span: 'wide' },
      { id: 'g2', caption: 'Le coucher', span: 'tall' },
      { id: 'g3', caption: 'La villa', span: 'normal' },
      { id: 'g4', caption: 'La dolce vita', span: 'normal' },
    ],
  },
  features: ['Hero', 'Gallery', 'Story', 'Timeline', 'Map', 'RSVP'],
},
]

// ─── Helpers ───────────────────────────────────────────────────────────────
export function getThemePackage(slug: string): ThemePackage | undefined {
  return THEME_PACKAGES.find((t) => t.slug === slug)
}

export function getThemeCssVars(theme: ThemePackage): Record<string, string> {
  const i = theme.identity
  return {
    '--theme-primary': i.primary,
    '--theme-primary-light': i.primaryLight,
    '--theme-primary-dark': i.primaryDark,
    '--theme-accent': i.accent,
    '--theme-accent-light': i.accentLight,
    '--theme-surface': i.surface,
    '--theme-surface-deep': i.surfaceDeep,
    '--theme-text': i.text,
    '--theme-text-muted': i.textMuted,
    '--theme-font-display': `'${i.fontDisplay}', serif`,
    '--theme-font-body': `'${i.fontBody}', sans-serif`,
    '--theme-pattern': i.pattern,
    '--theme-ambiance': i.ambiance,
  }
}
