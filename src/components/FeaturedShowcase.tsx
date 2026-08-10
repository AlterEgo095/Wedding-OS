'use client'

import { motion } from 'framer-motion'
import type { Easing } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Heart, Sparkles, Check } from 'lucide-react'
import { useMotionTier } from '@/lib/motion/useMotionTier'

/**
 * FeaturedShowcase — Platform proof-of-concept section.
 *
 * Presents the default/featured wedding as a LIVE demonstration of everything
 * the platform can do. The couple's identity comes from server-resolved
 * `stats` props (never hardcoded) — this section is tenant-agnostic and works
 * for whichever wedding is currently flagged `isDefault`.
 *
 * Design:
 *   - Split layout: cinematic couple photo on one side, narrative + stats on the other
 *   - Premium glass card with gold border for the narrative
 *   - Animated stat counters (framer-motion)
 *   - "Voir la démonstration" CTA
 *   - Scroll-triggered reveal animations
 *
 * Props come from the Server Component (page.tsx) — no client-side fetch.
 */

export interface FeaturedStats {
  guestCount: number
  photoCount: number
  timelineEventCount: number
  collectionCount: number
  coupleLabel: string
  weddingDate: string
  hashtag: string
  venueName: string
}

interface Props {
  stats: FeaturedStats | null
}

// Neutral fallback used only when the server passes NO stats at all
// (e.g. during initial SSR with no default wedding). These values are
// intentionally generic — they NEVER reference a specific couple, date, or
// venue, in accordance with the multi-tenant principle (Vision §préambule:
// "Aucun nom de couple, aucune date, aucun lieu... ne doit être structurellement
// codé en dur pour ce mariage").
const DEFAULT_STATS: FeaturedStats = {
  guestCount: 0,
  photoCount: 0,
  timelineEventCount: 0,
  collectionCount: 0,
  coupleLabel: 'Mariage Premium',
  weddingDate: 'Date à confirmer',
  hashtag: '',
  venueName: '',
}

function StatCard({
  value,
  label,
  delay,
}: {
  value: number | string
  label: string
  delay: number
}) {
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  const isStatic = prefersReducedMotion || tier === 'none'
  return (
    <motion.div
      initial={isStatic ? false : { opacity: 0, y: 20 }}
      whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
      viewport={isStatic ? undefined : { once: true, amount: 0.5 }}
      transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay }}
      className="text-center"
    >
      <div className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-1">
        {value}
      </div>
      <div className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-muted-foreground">
        {label}
      </div>
    </motion.div>
  )
}

export default function FeaturedShowcase({ stats }: Props) {
  const s = stats ?? DEFAULT_STATS
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed.
  const isStatic = prefersReducedMotion || tier === 'none'

  return (
    <section
      id="demonstration"
      aria-label="Démonstration — un mariage propulsé par la plateforme"
      className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* ═══ Backdrop ═══ */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.16_0.03_290)] via-background to-[oklch(0.18_0.04_30)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        {/* Gold particle accents */}
        <div className="absolute top-1/4 left-10 w-2 h-2 rounded-full bg-gold/30 blur-sm animate-pulse-gold" />
        <div className="absolute bottom-1/3 right-16 w-1.5 h-1.5 rounded-full bg-rose-gold/30 blur-sm animate-pulse-gold" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 right-1/4 w-1 h-1 rounded-full bg-gold-light/40 blur-sm animate-pulse-gold" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* ═══ Eyebrow ═══ */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
          viewport={isStatic ? undefined : { once: true }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <div className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent to-gold/60" />
          <span className="text-gold-light text-xs sm:text-sm font-display tracking-[0.3em] uppercase font-semibold">
            Démonstration Vivante
          </span>
          <div className="w-12 sm:w-20 h-px bg-gradient-to-l from-transparent to-gold/60" />
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* ═══ Left: Cinematic couple photo ═══ */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, scale: 0.9 }}
            whileInView={isStatic ? undefined : { opacity: 1, scale: 1 }}
            viewport={isStatic ? undefined : { once: true, amount: 0.3 }}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
            className="relative order-2 lg:order-1"
          >
            {/* Gold frame with glow */}
            <div className="relative rounded-3xl overflow-hidden group">
              {/* Outer gold gradient border */}
              <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-gold via-gold-light to-rose-gold opacity-60 group-hover:opacity-100 transition-opacity duration-700" />

              {/* Photo container */}
              <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] rounded-3xl overflow-hidden">
                <Image
                  src="/couple-hero.jpeg"
                  alt={`${s.coupleLabel} — mariage premium`}
                  fill
                  className="object-cover object-center transition-transform duration-[3s] group-hover:scale-105"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority={false}
                />
                {/* Cinematic gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                {/* Bottom overlay with couple info */}
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                  <motion.div
                    initial={isStatic ? false : { opacity: 0, y: 20 }}
                    whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
                    viewport={isStatic ? undefined : { once: true }}
                    transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Heart className="size-4 text-gold-light fill-gold-light/50" />
                      <span className="font-display text-xs tracking-[0.2em] uppercase text-gold-light/80 font-semibold">
                        Mariage Premium
                      </span>
                    </div>
                    <h3 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">
                      {s.coupleLabel}
                    </h3>
                    <p className="font-display text-sm text-white/70">
                      {s.weddingDate} · {s.venueName}
                    </p>
                  </motion.div>
                </div>
              </div>

              {/* Floating hashtag badge */}
              <motion.div
                initial={isStatic ? false : { opacity: 0, scale: 0.8, rotate: -5 }}
                whileInView={isStatic ? undefined : { opacity: 1, scale: 1, rotate: -3 }}
                viewport={isStatic ? undefined : { once: true }}
                transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.6 }}
                className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 z-10"
              >
                <div className="bg-gradient-to-br from-gold to-gold-dark text-white px-4 py-2 rounded-full shadow-2xl shadow-gold/30">
                  <span className="font-display text-xs sm:text-sm font-bold tracking-wide">
                    {s.hashtag}
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Decorative gold dots */}
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full border-2 border-gold/20 -z-10" />
            <div className="absolute -top-6 -right-6 w-16 h-16 rounded-full border border-rose-gold/20 -z-10" />
          </motion.div>

          {/* ═══ Right: Narrative + stats ═══ */}
          <div className="order-1 lg:order-2 space-y-8">
            <motion.div
              initial={isStatic ? false : { opacity: 0, y: 30 }}
              whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
              viewport={isStatic ? undefined : { once: true, amount: 0.3 }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
            >
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-6">
                <span className="text-foreground">Ce mariage est </span>
                <span className="gold-gradient">la preuve</span>
                <span className="text-foreground"> que votre rêve est possible.</span>
              </h2>

              <p className="font-display text-base sm:text-lg text-muted-foreground leading-relaxed mb-6">
                Chaque élément que vous voyez sur cette page — l'invitation
                digitale, la galerie luxueuse, le programme interactif, la
                musique d'ambiance, la recherche d'invité par nom — est propulsé
                par notre plateforme. <strong className="text-foreground">{s.coupleLabel}</strong>{' '}
                confie son mariage à notre technologie. À vous de choisir
                la vôtre parmi nos collections signature.
              </p>

              {/* Feature checklist */}
              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  'Invitation digitale sécurisée',
                  'Galerie photo premium',
                  'Programme animé',
                  'Recherche invité par nom',
                  'Musique d\u2019ambiance',
                  'Plan de table intelligent',
                ].map((feature, i) => (
                  <motion.div
                    key={feature}
                    initial={isStatic ? false : { opacity: 0, x: -15 }}
                    whileInView={isStatic ? undefined : { opacity: 1, x: 0 }}
                    viewport={isStatic ? undefined : { once: true }}
                    transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.3 + i * 0.08 }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center">
                      <Check className="size-3 text-gold-dark dark:text-gold-light" />
                    </div>
                    <span className="font-display text-sm text-foreground/80">
                      {feature}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ═══ Stats grid ═══ */}
            <motion.div
              initial={isStatic ? false : { opacity: 0, y: 30 }}
              whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
              viewport={isStatic ? undefined : { once: true, amount: 0.3 }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.3 }}
              className="grid grid-cols-4 gap-4 p-6 rounded-2xl glass-card gold-border"
            >
              <StatCard value={s.guestCount} label="Invités" delay={0.4} />
              <StatCard value={s.photoCount} label="Photos" delay={0.5} />
              <StatCard value={s.timelineEventCount} label="Étapes" delay={0.6} />
              <StatCard value={s.collectionCount} label="Collections" delay={0.7} />
            </motion.div>

            {/* ═══ CTA ═══ */}
            <motion.div
              initial={isStatic ? false : { opacity: 0, y: 20 }}
              whileInView={isStatic ? undefined : { opacity: 1, y: 0 }}
              viewport={isStatic ? undefined : { once: true }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide text-sm font-semibold shadow-2xl shadow-gold/30 hover:shadow-gold/50 transition-all duration-300 btn-premium"
              >
                <Sparkles className="size-4" />
                Créer mon mariage
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#savoir-faire"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('savoir-faire')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full glass-card gold-border text-foreground/90 font-display tracking-wide text-sm font-semibold transition-all duration-300 hover:bg-gold/10"
              >
                Découvrir le savoir-faire
              </a>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}