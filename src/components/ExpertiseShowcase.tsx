import Image from 'next/image'
import {
  Sparkles,
  ImageIcon,
  Music,
  CalendarClock,
  Users,
  Palette,
  ShieldCheck,
  Smartphone,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

/**
 * ExpertiseShowcase — "Notre savoir-faire"
 *
 * This section establishes the platform's expertise by showcasing 8 core
 * capabilities in a premium card grid. It is a Server Component (no client
 * JS) — all animations are pure CSS (scroll-triggered via IntersectionObserver
 * is avoided; instead we use CSS @keyframes + hover transitions for maximum
 * performance and zero hydration cost).
 *
 * Design language:
 *   - Dark cinematic backdrop with the generated gold-dust texture
 *   - Glass-morphism cards with gold borders
 *   - Lucide icons in gold gradient circles
 *   - Hover lift + glow micro-interaction
 *   - Premium serif/display typography
 */

interface Capability {
  icon: typeof Sparkles
  title: string
  description: string
  tag: string
}

const CAPABILITIES: Capability[] = [
  {
    icon: Sparkles,
    title: 'Invitations Digitales Premium',
    description:
      "QR codes sécurisés, liens chiffrés AES-256-GCM, authentification par nom. Chaque invité reçoit une expérience personnalisée et intime.",
    tag: 'AES-256-GCM',
  },
  {
    icon: ImageIcon,
    title: 'Galeries Luxueuses',
    description:
      "Photos plein écran avec lightbox, formats premium, optimisation Next.js Image. Une galerie digne des plus beaux magazines.",
    tag: 'Next/Image',
  },
  {
    icon: Music,
    title: 'Musique d\u2019Ambiance',
    description:
      "Player audio personnalisé avec contrôle du volume, autoplay respectueux des politiques navigateur. L'émotion commence dès l'arrivée.",
    tag: 'Audio',
  },
  {
    icon: CalendarClock,
    title: 'Programme Interactif',
    description:
      "Timeline animée du jour J avec icônes, horaires et lieux. Vos invités suivent chaque moment en temps réel.",
    tag: 'Timeline',
  },
  {
    icon: Users,
    title: 'Gestion des Invités & RSVP',
    description:
      "Gestion des tables, catégories, confirmations RSVP en temps réel. Recherche sécurisée anti-énumération par lookup token.",
    tag: 'RSVP',
  },
  {
    icon: Palette,
    title: 'Collections Signature',
    description:
      "Royal Gold, Royal Black, White Romance, Garden Bloom, Modern Minimalist. Cinq collections de design prémium, déployables en un clic.",
    tag: '5 Collections',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant Sécurisé',
    description:
      "Isolation complète des données par mariage, RBAC granulaire, audit log exhaustif. Chaque mariage est un univers privé et protégé.",
    tag: 'RBAC + Audit',
  },
  {
    icon: Smartphone,
    title: 'Expérience PWA Installable',
    description:
      "Installez la plateforme sur mobile, mode hors ligne, notifications push. Une vraie application, pas un simple site web.",
    tag: 'PWA',
  },
]

export default function ExpertiseShowcase() {
  return (
    <section
      id="savoir-faire"
      aria-label="Notre savoir-faire — les capacités de la plateforme"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* ═══ Cinematic backdrop ═══ */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/expertise-bg.jpeg"
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          priority={false}
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/85 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.7)_100%)]" />
        {/* Gold accent glows */}
        <div className="absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-gold/8 blur-[120px]" />
        <div className="absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-rose-gold/8 blur-[120px]" />
      </div>

      {/* ═══ Section header ═══ */}
      <div className="max-w-4xl mx-auto text-center mb-14 md:mb-20">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent to-gold/60" />
          <span className="text-gold-light text-xs sm:text-sm font-display tracking-[0.3em] uppercase font-semibold">
            Notre Savoir-Faire
          </span>
          <div className="w-12 sm:w-20 h-px bg-gradient-to-l from-transparent to-gold/60" />
        </div>

        {/* Heading */}
        <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
          <span className="text-foreground">Une plateforme </span>
          <span className="gold-gradient">complète</span>
          <span className="text-foreground"> pour votre mariage</span>
        </h2>

        {/* Subtitle */}
        <p className="font-display text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          De l'invitation digitale à la gestion des invités, chaque détail est
          pensé pour offrir une expérience d'exception. Voici ce que notre
          technologie met entre vos mains.
        </p>
      </div>

      {/* ═══ Capabilities grid ═══ */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon
            return (
              <div
                key={cap.title}
                className="group relative premium-card"
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                {/* Card body */}
                <div className="relative h-full glass-card gold-border rounded-2xl p-6 md:p-7 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_60px_-15px_oklch(0.68_0.12_85/25%)] overflow-hidden">
                  {/* Hover gold sheen */}
                  <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gold/0 via-gold/0 to-gold/0 group-hover:from-gold/5 group-hover:via-transparent group-hover:to-rose-gold/5 transition-all duration-700" />

                  {/* Icon */}
                  <div className="relative mb-5">
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-gold/20 to-rose-gold/10 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/20 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                      <Icon className="size-5 md:size-6 text-gold-dark dark:text-gold-light" />
                    </div>
                  </div>

                  {/* Tag */}
                  <span className="inline-block text-[10px] font-display tracking-[0.15em] uppercase text-gold-dark/70 dark:text-gold-light/70 bg-gold/5 border border-gold/15 rounded-full px-2.5 py-0.5 mb-3">
                    {cap.tag}
                  </span>

                  {/* Title */}
                  <h3 className="font-serif text-lg md:text-xl font-bold text-foreground mb-2 leading-snug">
                    {cap.title}
                  </h3>

                  {/* Description */}
                  <p className="font-display text-sm text-muted-foreground leading-relaxed">
                    {cap.description}
                  </p>

                  {/* Bottom gold line accent */}
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
              </div>
            )
          })}
        </div>

        {/* ═══ Bottom CTA strip ═══ */}
        <div className="mt-14 md:mt-20 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 px-8 py-6 rounded-2xl glass-card gold-border">
            <p className="font-serif text-lg md:text-xl text-foreground">
              Ces capacités sont déjà déployées sur le mariage de
              <span className="gold-gradient font-bold"> Josué &amp; Hornella</span>.
            </p>
            <Link
              href="#accueil"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide text-sm font-semibold shadow-xl shadow-gold/30 hover:shadow-gold/50 transition-all duration-300 btn-premium whitespace-nowrap"
            >
              Voir la démonstration
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>

    </section>
  )
}
