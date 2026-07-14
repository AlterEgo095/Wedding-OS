// ══════════════════════════════════════════════════════════════════════════════
// AENWS THEME PACKAGE SYSTEM — Architecture modulaire multi-thèmes
// ══════════════════════════════════════════════════════════════════════════════
// PRINCIPE: Un thème = une identité complète (pas juste des couleurs)
//
// Chaque ThemePackage définit:
//   - identity: palette étendue + typo + motif + ambiance
//   - structure: quelles sections, dans quel ordre, avec quelles variantes
//   - components: variantes de composants (hero, gallery, timeline...)
//   - invitation: template d'invitation + RSVP + QR style
//   - demoContent: couple démo + photos + histoire + timeline propres au thème
// ══════════════════════════════════════════════════════════════════════════════

export type HeroVariant =
  | 'cinematic-parallax'
  | 'split-overlay'
  | 'minimal-center'
  | 'destination-full'
  | 'african-regal'

export type GalleryVariant =
  | 'masonry'
  | 'grid-uniform'
  | 'carousel'
  | 'polaroid'

export type TimelineVariant =
  | 'alternating'
  | 'vertical-list'
  | 'card-stack'

export type StoryVariant =
  | 'chapters'
  | 'scroll-narrative'

export type GuestAuthVariant =
  | 'glass-portal'
  | 'minimal-form'
  | 'envelope'

export type MapVariant =
  | 'cinematic-zoom'
  | 'split-card'
  | 'full-bleed'

export interface ThemeSection {
  id: string
  type: 'hero' | 'story' | 'gallery' | 'timeline' | 'map' | 'guest-auth'
  variant: HeroVariant | GalleryVariant | TimelineVariant | StoryVariant | GuestAuthVariant | MapVariant
  enabled: boolean
  order: number
}

export interface ThemeInvitation {
  template: 'classic-card' | 'envelope-luxury' | 'minimal-digital' | 'african-vibrant' | 'tropical-postcard'
  rsvpStyle: 'inline-form' | 'modal-dialog' | 'stepped-wizard'
  qrStyle: 'gold-ornate' | 'minimal-monochrome' | 'colorful-frame'
  shareStyle: 'social-cards' | 'link-elegant'
}

export interface DemoCouple {
  groomName: string
  brideName: string
  groomInitial: string
  brideInitial: string
  weddingDate: string
  weddingDateShort: string
  venue: string
  venueCity: string
  venueAddress: string
  hashtag: string
  heroImage: string
  story: Array<{
    id: string
    title: string
    date: string
    description: string
    side: 'left' | 'right'
  }>
  timeline: Array<{
    id: string
    time: string
    title: string
    location: string
    description: string
    icon: string
  }>
  gallery: Array<{
    id: string
    caption: string
    span: 'tall' | 'normal' | 'wide'
  }>
}

export interface ThemeIdentity {
  primary: string
  primaryLight: string
  primaryDark: string
  accent: string
  accentLight: string
  surface: string
  surfaceDeep: string
  text: string
  textMuted: string
  fontDisplay: string
  fontBody: string
  displayWeight: string
  bodyWeight: string
  pattern: string
  ambiance: string
  googleFontUrl: string
}

export interface ThemePackage {
  slug: string
  name: string
  category: 'LUXURY' | 'CLASSIC' | 'AFRICAN' | 'MINIMAL' | 'DESTINATION'
  tier: 'FREE' | 'PREMIUM' | 'EXCLUSIVE'
  description: string
  identity: ThemeIdentity
  sections: ThemeSection[]
  invitation: ThemeInvitation
  demo: DemoCouple
  features: string[]
}

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  LUXURY: { label: 'Luxe', color: '#D4AF37' },
  CLASSIC: { label: 'Classique', color: '#8B6F47' },
  AFRICAN: { label: 'Africain', color: '#E8A53D' },
  MINIMAL: { label: 'Minimal', color: '#5A7A9A' },
  DESTINATION: { label: 'Destination', color: '#4FC3F7' },
}

export const TIER_META: Record<string, { label: string; color: string }> = {
  FREE: { label: 'Gratuit', color: '#4ade80' },
  PREMIUM: { label: 'Premium', color: '#D4AF37' },
  EXCLUSIVE: { label: 'Exclusif', color: '#a855f7' },
}
