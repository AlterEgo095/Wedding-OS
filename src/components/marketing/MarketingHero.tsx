'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Sparkles, ArrowRight, Calendar, Palette, Globe } from 'lucide-react'

/**
 * MarketingHero — SECTION 1
 *
 * Answers the 5 marketing questions in <5 seconds:
 *   1. QUOI ? Une plateforme de création d'expériences événementielles
 *   2. À QUI ? Couples, organisateurs, agences, entreprises
 *   3. QUE PEUT-ELLE ? Créer, designer, publier, exploiter
 *   4. POURQUOI DIFFÉRENTE ? Multi-tenant, Collections, Designer
 *   5. ACTION ? Créer mon expérience / Découvrir les Collections
 *
 * NO default wedding dependency. NO couple photos. NO hardcoded names.
 * This is a PLATFORM hero, not a wedding hero.
 */
export default function MarketingHero() {
  return (
    <section
      id="accueil"
      className="relative min-h-[92vh] flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8"
    >
      {/* Backdrop — premium, cinematic, brand-neutral */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.16_0.02_290)] via-background to-[oklch(0.13_0.03_30)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        {/* Subtle gold particle accents (decorative, lightweight) */}
        <div className="absolute top-1/4 left-10 w-1.5 h-1.5 rounded-full bg-gold/40 blur-sm animate-pulse-gold" />
        <div className="absolute bottom-1/3 right-16 w-2 h-2 rounded-full bg-gold/30 blur-sm animate-pulse-gold" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 right-1/4 w-1 h-1 rounded-full bg-gold-light/50 blur-sm animate-pulse-gold" style={{ animationDelay: '0.8s' }} />
      </div>

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5 mb-8"
        >
          <Sparkles className="size-3.5 text-gold/70" />
          <span className="font-display text-[10px] sm:text-xs tracking-[0.25em] uppercase text-gold/80 font-semibold">
            AENEWS Event Experience Platform
          </span>
        </motion.div>

        {/* Headline — PLATFORM, not a couple */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6"
        >
          <span className="text-foreground">Créez des</span>{' '}
          <span className="gold-gradient">expériences événementielles</span>{' '}
          <span className="text-foreground">qui marquent les esprits.</span>
        </motion.h1>

        {/* Subheadline — WHAT + WHO */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="font-display text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Une plateforme numérique complète pour <strong className="text-foreground">couples, organisateurs, agences et entreprises</strong> —
          concevez, personnalisez, publiez et exploitez des événements uniques, sans écrire une ligne de code.
        </motion.p>

        {/* CTAs — real routes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide text-sm font-semibold shadow-2xl shadow-gold/30 hover:shadow-gold/50 transition-all duration-300 btn-premium w-full sm:w-auto"
          >
            <Calendar className="size-4" />
            Créer mon expérience
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="#collections"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full glass-card gold-border text-foreground/90 font-display tracking-wide text-sm font-semibold transition-all duration-300 hover:bg-gold/10 w-full sm:w-auto"
          >
            <Palette className="size-4" />
            Découvrir les Collections
          </Link>
        </motion.div>

        {/* Trust indicators — real platform stats, not a couple's stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-16 grid grid-cols-3 gap-4 max-w-2xl mx-auto"
        >
          {[
            { value: '12+', label: 'Collections' },
            { value: '5', label: 'Layouts' },
            { value: '∞', label: 'Événements' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.9 + i * 0.1 }}
              className="text-center"
            >
              <div className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold gold-gradient mb-1">
                {stat.value}
              </div>
              <div className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-muted-foreground">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
