import type {
  PremiumCollection,
  CollectionPack,
  PackId,
} from './types'

// ══════════════════════════════════════════════════════════════════════════════
// PACK BUILDERS — shared structure so every Collection has the same 5 packs
// and the same module slots. Only the variants (renderer + tags) differ.
// ══════════════════════════════════════════════════════════════════════════════

interface VariantSeed {
  name: string
  description: string
  renderer: string
  quality?: number
  tags?: string[]
}

function buildPack(
  id: PackId,
  name: string,
  description: string,
  icon: string,
  modules: { id: string; name: string; description: string; required: boolean; variants: VariantSeed[] }[],
): CollectionPack {
  return {
    id,
    name,
    description,
    icon,
    modules: modules.map((m) => ({
      id: m.id as CollectionPack['modules'][number]['id'],
      name: m.name,
      description: m.description,
      pack: id,
      required: m.required,
      variants: m.variants.map((v, i) => ({
        id: (['A', 'B', 'C', 'D'] as const)[i] || 'A',
        name: v.name,
        description: v.description,
        renderer: v.renderer,
        quality: v.quality ?? 90,
        tags: v.tags ?? [],
      })),
    })),
  }
}

// ─── Website Pack (9 modules) ──────────────────────────────────────────────────
function websitePack(prefix: string): CollectionPack {
  return buildPack('website', 'Website', 'Site web de mariage complet', 'Globe', [
    {
      id: 'hero', name: 'Hero', description: 'Section d\'ouverture plein écran', required: true,
      variants: [
        { name: 'Cinématique centré', description: 'Photo plein écran + noms centrés + countdown', renderer: `${prefix}-hero-A`, quality: 95, tags: ['cinematic', 'centered', 'countdown'] },
        { name: 'Split asymétrique', description: 'Photo gauche, texte droite, lignes dorées', renderer: `${prefix}-hero-B`, quality: 92, tags: ['split', 'asymmetric', 'elegant'] },
        { name: 'Voile overlay', description: 'Photo voilée, typographie géante, ornement', renderer: `${prefix}-hero-C`, quality: 90, tags: ['overlay', 'dramatic', 'large-type'] },
      ],
    },
    {
      id: 'countdown', name: 'Compte à rebours', description: 'Compteur temps réel jusqu\'au jour J', required: true,
      variants: [
        { name: 'Anneaux dorés', description: 'Cercles concentriques dorés animés', renderer: `${prefix}-countdown-A`, quality: 93, tags: ['animated', 'circular'] },
      ],
    },
    {
      id: 'story', name: 'Notre histoire', description: 'Timeline du couple', required: true,
      variants: [
        { name: 'Timeline verticale', description: 'Alternance gauche/droite avec photos', renderer: `${prefix}-story-A`, quality: 90, tags: ['timeline', 'vertical'] },
      ],
    },
    {
      id: 'gallery', name: 'Galerie', description: 'Galerie photos premium masonry', required: true,
      variants: [
        { name: 'Masonry doré', description: 'Grille asymétrique avec hover doré', renderer: `${prefix}-gallery-A`, quality: 91, tags: ['masonry', 'hover'] },
      ],
    },
    {
      id: 'programme', name: 'Programme', description: 'Déroulé de la journée', required: true,
      variants: [
        { name: 'Cartes horaires', description: 'Cartes avec icônes et heures', renderer: `${prefix}-programme-A`, quality: 89, tags: ['cards', 'timeline'] },
      ],
    },
    {
      id: 'rsvp', name: 'RSVP', description: 'Confirmation de présence', required: true,
      variants: [
        { name: 'Formulaire élégant', description: 'Champs stylés avec validation', renderer: `${prefix}-rsvp-A`, quality: 88, tags: ['form', 'validation'] },
      ],
    },
    {
      id: 'footer', name: 'Footer', description: 'Pied de page avec signature', required: false,
      variants: [
        { name: 'Signature dorée', description: 'Hashtag + signature + lien RSVP', renderer: `${prefix}-footer-A`, quality: 85, tags: ['signature'] },
      ],
    },
    {
      id: 'loader', name: 'Loader', description: 'Écran de chargement', required: false,
      variants: [
        { name: 'Couronne dorée', description: 'Animation couronne + pourcentage', renderer: `${prefix}-loader-A`, quality: 84, tags: ['animated'] },
      ],
    },
    {
      id: 'splash', name: 'Splash', description: 'Écran d\'accueil avant entrée', required: false,
      variants: [
        { name: 'Enveloppe dorée', description: 'Animation enveloppe qui s\'ouvre', renderer: `${prefix}-splash-A`, quality: 86, tags: ['animated', 'envelope'] },
      ],
    },
  ])
}

// ─── Invitations Pack (8 modules) ──────────────────────────────────────────────
function invitationsPack(prefix: string): CollectionPack {
  return buildPack('invitations', 'Invitations', 'Invitations numériques et imprimables', 'Mail', [
    {
      id: 'standard', name: 'Invitation Standard', description: 'Invitation principale pour invités standard', required: true,
      variants: [
        { name: 'Version A — Classique', description: 'Carte centrée, ornements dorés, QR en bas', renderer: `${prefix}-invite-std-A`, quality: 94, tags: ['centered', 'classic'] },
        { name: 'Version B — Moderne', description: 'Asymétrique, typographie large, ligne dorée', renderer: `${prefix}-invite-std-B`, quality: 92, tags: ['modern', 'asymmetric'] },
        { name: 'Version C — Cinématique', description: 'Photo fond, voile, texte blanc', renderer: `${prefix}-invite-std-C`, quality: 93, tags: ['cinematic', 'photo-bg'] },
        { name: 'Version D — Minimal', description: 'Épuré, beaucoup d\'air, ornement unique', renderer: `${prefix}-invite-std-D`, quality: 90, tags: ['minimal', 'airy'] },
      ],
    },
    {
      id: 'vip', name: 'Invitation VIP', description: 'Invitation premium pour invités VIP', required: true,
      variants: [
        { name: 'Version A — Couronne', description: 'Couronne dorée en haut, accents VIP', renderer: `${prefix}-invite-vip-A`, quality: 93, tags: ['vip', 'crown'] },
        { name: 'Version B — Double or', description: 'Double bordure dorée, sceau cire', renderer: `${prefix}-invite-vip-B`, quality: 91, tags: ['vip', 'double-border'] },
      ],
    },
    {
      id: 'famille', name: 'Invitation Famille', description: 'Invitation pour la famille proche', required: true,
      variants: [
        { name: 'Version A — Cœur', description: 'Ornement cœur, message familial', renderer: `${prefix}-invite-famille-A`, quality: 89, tags: ['family', 'heart'] },
      ],
    },
    {
      id: 'couple', name: 'Invitation Couple', description: 'Invitation pour couples (+1)', required: false,
      variants: [
        { name: 'Version A — Duo', description: 'Deux noms, deux sièges', renderer: `${prefix}-invite-couple-A`, quality: 87, tags: ['couple', 'duo'] },
      ],
    },
    {
      id: 'sponsor', name: 'Invitation Sponsor', description: 'Invitation pour sponsors et témoins', required: false,
      variants: [
        { name: 'Version A — Sceau', description: 'Sceau de cire, mention honorifique', renderer: `${prefix}-invite-sponsor-A`, quality: 86, tags: ['sponsor', 'seal'] },
      ],
    },
    {
      id: 'presse', name: 'Invitation Presse', description: 'Invitation pour presse et médias', required: false,
      variants: [
        { name: 'Version A — Presse', description: 'Format presse, accréditation', renderer: `${prefix}-invite-presse-A`, quality: 82, tags: ['press'] },
      ],
    },
    {
      id: 'numerique', name: 'Invitation Numérique', description: 'Version numérique partageable WhatsApp', required: true,
      variants: [
        { name: 'Version A — WhatsApp', description: 'Format 9:16 partageable', renderer: `${prefix}-invite-num-A`, quality: 88, tags: ['digital', 'whatsapp'] },
      ],
    },
    {
      id: 'impression', name: 'Invitation Impression', description: 'Version haute résolution imprimable', required: false,
      variants: [
        { name: 'Version A — Print', description: '300dpi, fond perdu, CMJN', renderer: `${prefix}-invite-print-A`, quality: 85, tags: ['print', '300dpi'] },
      ],
    },
  ])
}

// ─── Print Pack (8 modules) ────────────────────────────────────────────────────
function printPack(prefix: string): CollectionPack {
  return buildPack('print', 'Print', 'Supports imprimables (badges, QR, plans)', 'Printer', [
    {
      id: 'badge', name: 'Badge', description: 'Badge invité avec nom + catégorie', required: true,
      variants: [
        { name: 'Version A — Ruban', description: 'Ruban doré + nom + catégorie', renderer: `${prefix}-badge-A`, quality: 90, tags: ['badge', 'ribbon'] },
      ],
    },
    {
      id: 'qr', name: 'QR Code', description: 'QR code d\'accès invité', required: true,
      variants: [
        { name: 'Version A — Encadré', description: 'QR dans cadre doré + nom invité', renderer: `${prefix}-qr-A`, quality: 91, tags: ['qr', 'framed'] },
      ],
    },
    {
      id: 'parking', name: 'Parking', description: 'Carte de parking invité', required: false,
      variants: [
        { name: 'Version A — Parking', description: 'Carte avec place attribuée', renderer: `${prefix}-parking-A`, quality: 84, tags: ['parking'] },
      ],
    },
    {
      id: 'table-number', name: 'Numéro de table', description: 'Étiquette de numéro de table', required: true,
      variants: [
        { name: 'Version A — Chevalet', description: 'Format chevalet, ornement', renderer: `${prefix}-table-A`, quality: 89, tags: ['table', 'stand'] },
      ],
    },
    {
      id: 'place-card', name: 'Marque-place', description: 'Marque-place individuel', required: true,
      variants: [
        { name: 'Version A — Plié', description: 'Carte pliée, nom calligraphié', renderer: `${prefix}-placecard-A`, quality: 88, tags: ['place-card', 'folded'] },
      ],
    },
    {
      id: 'menu', name: 'Menu', description: 'Carte menu de table', required: false,
      variants: [
        { name: 'Version A — Menu', description: 'Menu calligraphié avec ornements', renderer: `${prefix}-menu-A`, quality: 86, tags: ['menu'] },
      ],
    },
    {
      id: 'gift', name: 'Liste de cadeaux', description: 'Carte liste de mariage', required: false,
      variants: [
        { name: 'Version A — Cadeaux', description: 'Liste avec QR et message', renderer: `${prefix}-gift-A`, quality: 83, tags: ['gift'] },
      ],
    },
    {
      id: 'remerciement', name: 'Remerciement', description: 'Carte de remerciement', required: false,
      variants: [
        { name: 'Version A — Merci', description: 'Carte merci avec photo couple', renderer: `${prefix}-thanks-A`, quality: 85, tags: ['thanks'] },
      ],
    },
  ])
}

// ─── Communication Pack (8 modules) ────────────────────────────────────────────
function communicationPack(prefix: string): CollectionPack {
  return buildPack('communication', 'Communication', 'Visuels réseaux sociaux et communication', 'Megaphone', [
    {
      id: 'facebook', name: 'Facebook', description: 'Publication Facebook 1200x630', required: true,
      variants: [
        { name: 'Version A — Save the date', description: 'Save the date Facebook', renderer: `${prefix}-fb-A`, quality: 90, tags: ['facebook', 'save-the-date'] },
      ],
    },
    {
      id: 'instagram', name: 'Instagram', description: 'Publication Instagram 1080x1080', required: true,
      variants: [
        { name: 'Version A — Carré', description: 'Carré Instagram avec photo', renderer: `${prefix}-ig-A`, quality: 91, tags: ['instagram', 'square'] },
      ],
    },
    {
      id: 'story', name: 'Story', description: 'Story Instagram/Facebook 1080x1920', required: true,
      variants: [
        { name: 'Version A — Story', description: 'Story verticale animée', renderer: `${prefix}-cstory-A`, quality: 88, tags: ['story', 'vertical'] },
      ],
    },
    {
      id: 'email', name: 'Email', description: 'Template email HTML', required: false,
      variants: [
        { name: 'Version A — Email', description: 'Email HTML responsive', renderer: `${prefix}-email-A`, quality: 84, tags: ['email', 'responsive'] },
      ],
    },
    {
      id: 'banner', name: 'Bannière', description: 'Bannière web générique', required: false,
      variants: [
        { name: 'Version A — Bannière', description: 'Bannière 1440x400', renderer: `${prefix}-banner-A`, quality: 85, tags: ['banner'] },
      ],
    },
    {
      id: 'affiche', name: 'Affiche', description: 'Affiche A3 imprimable', required: false,
      variants: [
        { name: 'Version A — Affiche', description: 'Affiche A3 Save the date', renderer: `${prefix}-affiche-A`, quality: 86, tags: ['poster', 'a3'] },
      ],
    },
    {
      id: 'rollup', name: 'Roll-up', description: 'Roll-up 85x200cm', required: false,
      variants: [
        { name: 'Version A — Roll-up', description: 'Roll-up événementiel', renderer: `${prefix}-rollup-A`, quality: 82, tags: ['rollup'] },
      ],
    },
    {
      id: 'whatsapp', name: 'WhatsApp', description: 'Visuel partage WhatsApp', required: true,
      variants: [
        { name: 'Version A — WhatsApp', description: 'Visuel WhatsApp 1080x1080', renderer: `${prefix}-wa-A`, quality: 87, tags: ['whatsapp'] },
      ],
    },
  ])
}

// ─── Luxury Pack (5 modules) ───────────────────────────────────────────────────
function luxuryPack(prefix: string): CollectionPack {
  return buildPack('luxury', 'Luxury', 'Effets, animations et finitions premium', 'Sparkles', [
    {
      id: 'animations', name: 'Animations', description: 'Animations CSS premium', required: true,
      variants: [
        { name: 'Version A — Or fondu', description: 'Animations dorées fluides', renderer: `${prefix}-anim-A`, quality: 92, tags: ['animation', 'gold'] },
      ],
    },
    {
      id: 'transitions', name: 'Transitions', description: 'Transitions entre sections', required: true,
      variants: [
        { name: 'Version A — Fondu enchaîné', description: 'Transitions douces', renderer: `${prefix}-trans-A`, quality: 90, tags: ['transition'] },
      ],
    },
    {
      id: 'palette', name: 'Palette', description: 'Palette de couleurs Collection', required: true,
      variants: [
        { name: 'Version A — Palette', description: 'Aperçu palette officielle', renderer: `${prefix}-palette-A`, quality: 94, tags: ['palette'] },
      ],
    },
    {
      id: 'typography', name: 'Typographie', description: 'Système typographique', required: true,
      variants: [
        { name: 'Version A — Typo', description: 'Aperçu polices display + body', renderer: `${prefix}-typo-A`, quality: 93, tags: ['typography'] },
      ],
    },
    {
      id: 'effects', name: 'Effets', description: 'Effets visuels (particules, bokeh)', required: false,
      variants: [
        { name: 'Version A — Particules', description: 'Particules dorées flottantes', renderer: `${prefix}-effects-A`, quality: 88, tags: ['particles', 'bokeh'] },
      ],
    },
  ])
}

function allPacks(prefix: string): CollectionPack[] {
  return [
    websitePack(prefix),
    invitationsPack(prefix),
    printPack(prefix),
    communicationPack(prefix),
    luxuryPack(prefix),
  ]
}

// ══════════════════════════════════════════════════════════════════════════════
// THE 5 PREMIUM COLLECTIONS
// ══════════════════════════════════════════════════════════════════════════════

export const COLLECTIONS: PremiumCollection[] = [
  // ─── 1. ROYAL GOLD (100% complete — reference) ───────────────────────────────
  {
    id: 'royal-gold',
    name: 'Royal Gold',
    family: 'Royal Collection',
    category: 'ROYAL',
    tier: 'EXCLUSIVE',
    tagline: 'L\'or éternel pour un mariage majestueux',
    description: 'La Collection de référence. Or franc sur fond noir profond, typographie serif majestueuse, ornements baroques. Toutes les variantes sont produites et opérationnelles.',
    designSystem: {
      primary: '#D4A853',
      secondary: '#C8785A',
      background: '#0F0A05',
      surface: '#1A1410',
      text: '#F5E6D3',
      textMuted: '#A89178',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      decorative: 'gold-foil',
    },
    coverImage: '/collections/royal-gold.svg',
    completionPct: 100,
    version: '1.0.0',
    designer: 'Studio Heureux Mariage',
    publishedAt: '2025-01-15T10:00:00.000Z',
    priceFcfa: 850000,
    priceUsd: 1400,
    packs: allPacks('rg'),
  },

  // ─── 2. ROYAL BLACK ───────────────────────────────────────────────────────────
  {
    id: 'royal-black',
    name: 'Royal Black',
    family: 'Royal Collection',
    category: 'LUXURY',
    tier: 'EXCLUSIVE',
    tagline: 'Le noir absolu, l\'argent pur, l\'élégance monochrome',
    description: 'Ultra-formel, black tie. Noir mat, feuille d\'argent, géométrie art déco. Pour les mariages cérémonieux contemporains.',
    designSystem: {
      primary: '#C0C0C0',
      secondary: '#6B6B6B',
      background: '#0A0A0A',
      surface: '#161616',
      text: '#E8E8E8',
      textMuted: '#8A8A8A',
      fontDisplay: 'Marcellus',
      fontBody: 'Montserrat',
      decorative: 'silver-foil',
    },
    coverImage: '/collections/royal-black.svg',
    completionPct: 78,
    version: '0.9.0',
    designer: 'Studio Heureux Mariage',
    publishedAt: '2025-02-01T10:00:00.000Z',
    priceFcfa: 900000,
    priceUsd: 1500,
    packs: allPacks('rb'),
  },

  // ─── 3. WHITE ROMANCE ─────────────────────────────────────────────────────────
  {
    id: 'white-romance',
    name: 'White Romance',
    family: 'Romance Collection',
    category: 'ROMANTIC',
    tier: 'PREMIUM',
    tagline: 'Blanc, ivoire, douceur — la poésie florale',
    description: 'Aquarelle florale, blanc et ivoire, blush rose. Beaucoup d\'air, typographie fine. Pour les mariages romantiques et poétiques.',
    designSystem: {
      primary: '#E8B4B8',
      secondary: '#C9A87C',
      background: '#FDFBF7',
      surface: '#FFFFFF',
      text: '#4A3B32',
      textMuted: '#8A7A6E',
      fontDisplay: 'Playfair Display',
      fontBody: 'Lato',
      decorative: 'floral',
    },
    coverImage: '/collections/white-romance.svg',
    completionPct: 72,
    version: '0.8.0',
    designer: 'Studio Heureux Mariage',
    publishedAt: '2025-02-10T10:00:00.000Z',
    priceFcfa: 700000,
    priceUsd: 1150,
    packs: allPacks('wr'),
  },

  // ─── 4. KENTE PRESTIGE ────────────────────────────────────────────────────────
  {
    id: 'kente-prestige',
    name: 'Kente Prestige',
    family: 'Héritage Collection',
    category: 'CULTURAL',
    tier: 'EXCLUSIVE',
    tagline: 'L\'héritage africain, le prestige kente',
    description: 'Motifs kente vibrants, or, rouge et émeraude, symboles adinkra. Pour les mariages africains célébrant l\'héritage culturel.',
    designSystem: {
      primary: '#D4A853',
      secondary: '#C0392B',
      background: '#1F0F08',
      surface: '#2D160B',
      text: '#F5E6D3',
      textMuted: '#B89570',
      fontDisplay: 'Playfair Display',
      fontBody: 'Lora',
      decorative: 'african',
    },
    coverImage: '/collections/kente-prestige.svg',
    completionPct: 65,
    version: '0.7.0',
    designer: 'Studio Heureux Mariage',
    publishedAt: '2025-02-15T10:00:00.000Z',
    priceFcfa: 950000,
    priceUsd: 1600,
    packs: allPacks('kp'),
  },

  // ─── 5. BEACH LUXURY ──────────────────────────────────────────────────────────
  {
    id: 'beach-luxury',
    name: 'Beach Luxury',
    family: 'Évasion Collection',
    category: 'BEACH',
    tier: 'PREMIUM',
    tagline: 'Turquoise, sable, corail — l\'élégance côtière',
    description: 'Turquoise et sable, corail, palmes, coucher de soleil. Pour les mariages plage et destination.',
    designSystem: {
      primary: '#4FB3BF',
      secondary: '#E8A87C',
      background: '#F7F3EC',
      surface: '#FFFFFF',
      text: '#2C4A52',
      textMuted: '#7A99A1',
      fontDisplay: 'Italiana',
      fontBody: 'Inter',
      decorative: 'coastal',
    },
    coverImage: '/collections/beach-luxury.svg',
    completionPct: 68,
    version: '0.7.0',
    designer: 'Studio Heureux Mariage',
    publishedAt: '2025-02-20T10:00:00.000Z',
    priceFcfa: 750000,
    priceUsd: 1250,
    packs: allPacks('bl'),
  },
]

// ─── Accessors ──────────────────────────────────────────────────────────────────

export function listCollections(): PremiumCollection[] {
  return COLLECTIONS
}

export function getCollection(id: string): PremiumCollection | undefined {
  return COLLECTIONS.find((c) => c.id === id)
}

export function listFamilies(): { family: string; collections: PremiumCollection[] }[] {
  const map = new Map<string, PremiumCollection[]>()
  for (const c of COLLECTIONS) {
    if (!map.has(c.family)) map.set(c.family, [])
    map.get(c.family)!.push(c)
  }
  return Array.from(map.entries()).map(([family, collections]) => ({ family, collections }))
}
