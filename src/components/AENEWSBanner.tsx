'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ExternalLink, Sparkles, Zap, Globe, Cpu, BarChart3, Palette, ArrowUpRight, Gem, Shield, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'

const AENEWS_URL = 'https://aenews.net'
const WHATSAPP_DEVIS = 'https://wa.me/243816515095?text=Bonjour%2C%20je%20souhaite%20obtenir%20un%20devis%20pour%20une%20solution%20num%C3%A9rique.'

const capabilities = [
  { icon: Globe, label: 'Plateformes Web' },
  { icon: Cpu, label: 'Intelligence Artificielle' },
  { icon: BarChart3, label: 'Automatisation' },
  { icon: Palette, label: 'Design Premium' },
]

const trustBadges = [
  { icon: Gem, label: 'Sur mesure' },
  { icon: Shield, label: 'Sécurisé' },
  { icon: Rocket, label: 'Innovant' },
]

export default function AENEWSBanner() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section
      ref={sectionRef}
      className="relative py-20 md:py-28 overflow-hidden"
    >
      {/* ─── Cinematic Dark Background ─── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.10_0.02_270)] via-[oklch(0.08_0.03_270)] to-[oklch(0.06_0.04_270)]" />

      {/* Animated gradient mesh */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            x: [0, 40, 0],
            y: [0, -30, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.68 0.12 85 / 12%) 0%, transparent 70%)',
          }}
        />
        <motion.div
          animate={{
            x: [0, -30, 0],
            y: [0, 25, 0],
            opacity: [0.15, 0.35, 0.15],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.08 30 / 8%) 0%, transparent 70%)',
          }}
        />
        <motion.div
          animate={{ opacity: [0.05, 0.15, 0.05] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.68 0.12 85 / 4%) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 rounded-full bg-[oklch(0.68_0.12_85/30%)]"
            style={{
              left: `${10 + i * 12}%`,
              top: `${20 + (i * 17) % 60}%`,
            }}
            animate={{
              y: [-20, 20, -20],
              opacity: [0.1, 0.5, 0.1],
              scale: [1, 2, 1],
            }}
            transition={{
              duration: 6 + i * 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.3,
            }}
          />
        ))}
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(0.72 0.12 85 / 30%) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.12 85 / 30%) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Top gold line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.68_0.12_85/50%)] to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Main Content ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Brand Identity */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            {/* AE Monogram - Large */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center justify-center mb-8"
            >
              <div className="relative">
                {/* Outer glow ring */}
                <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.12_85/25%)] via-transparent to-[oklch(0.72_0.08_30/20%)] blur-xl" />
                {/* Pulsing ring */}
                <motion.div
                  animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -inset-2 rounded-2xl border border-[oklch(0.68_0.12_85/20%)]"
                />
                {/* Logo container */}
                <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.12_85)] to-[oklch(0.58_0.14_75)] flex items-center justify-center shadow-2xl shadow-[oklch(0.68_0.12_85/30%)]">
                  <span className="font-serif text-3xl md:text-4xl font-bold text-white">AE</span>
                </div>
              </div>
            </motion.div>

            {/* Brand name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <p className="font-display text-sm md:text-base tracking-[0.25em] uppercase text-white/30 mb-3 font-semibold">
                Conçu et développé par
              </p>
              <h3 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold mb-3">
                <span className="bg-gradient-to-r from-[oklch(0.88_0.08_85)] via-[oklch(0.68_0.12_85)] to-[oklch(0.72_0.08_30)] bg-clip-text text-transparent">
                  AENEWS
                </span>
              </h3>

              <div className="flex items-center gap-2 mb-6">
                <div className="h-px w-10 bg-gradient-to-r from-[oklch(0.68_0.12_85/50%)] to-transparent" />
                <span className="text-xs font-display tracking-[0.3em] uppercase text-[oklch(0.72_0.12_85/70%)] font-bold">
                  Meilleur qu&apos;hier
                </span>
                <div className="h-px w-10 bg-gradient-to-l from-[oklch(0.68_0.12_85/50%)] to-transparent" />
              </div>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="font-display text-base md:text-lg text-white/50 max-w-lg leading-relaxed"
            >
              Solutions numériques, plateformes intelligentes, automatisation et innovation digitale pour particuliers, entreprises et organisations.
            </motion.p>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-center gap-6 mt-8"
            >
              {trustBadges.map((badge, i) => (
                <motion.div
                  key={badge.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                  className="flex items-center gap-1.5"
                >
                  <badge.icon className="size-4 text-[oklch(0.68_0.12_85/70%)]" />
                  <span className="text-xs font-display font-bold tracking-wide text-white/50 uppercase">{badge.label}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: Capabilities + CTAs */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {/* Capabilities Grid */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 mb-8">
              {capabilities.map((cap, i) => (
                <motion.div
                  key={cap.label}
                  initial={{ opacity: 0, y: 15 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                  className="flex flex-col items-center gap-3 p-5 md:p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.06] hover:border-[oklch(0.68_0.12_85/25%)] transition-all duration-300 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[oklch(0.68_0.12_85/15%)] to-[oklch(0.72_0.08_30/10%)] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <cap.icon className="size-5 text-[oklch(0.68_0.12_85/80%)] group-hover:text-[oklch(0.82_0.08_85)] transition-colors" />
                  </div>
                  <span className="text-sm font-display font-bold text-white/50 group-hover:text-white/70 transition-colors">
                    {cap.label}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="font-display text-sm text-white/30 leading-relaxed mb-8"
            >
              AENEWS accompagne les entreprises, entrepreneurs, organisateurs d&apos;événements et institutions dans la création de plateformes web modernes, applications métiers, solutions d&apos;automatisation, intelligence artificielle et transformation numérique.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="flex flex-col sm:flex-row items-start gap-4"
            >
              {/* Primary: Discover AENEWS */}
              <a
                href={AENEWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative"
              >
                <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-[oklch(0.68_0.12_85/25%)] to-[oklch(0.72_0.08_30/20%)] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Button
                  size="lg"
                  className="relative bg-gradient-to-r from-[oklch(0.68_0.12_85)] to-[oklch(0.58_0.14_75)] hover:from-[oklch(0.72_0.12_85)] hover:to-[oklch(0.62_0.14_75)] text-white shadow-xl shadow-[oklch(0.68_0.12_85/20%)] hover:shadow-2xl hover:shadow-[oklch(0.68_0.12_85/30%)] transition-all duration-300 rounded-full px-8 py-6 font-display font-bold tracking-wide text-base"
                >
                  <Sparkles className="size-5 mr-2" />
                  Découvrir AENEWS
                  <ArrowUpRight className="size-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
                </Button>
              </a>

              {/* Secondary: Request Quote */}
              <a
                href={WHATSAPP_DEVIS}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative"
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="relative border-white/15 hover:border-[oklch(0.68_0.12_85/40%)] bg-white/[0.03] hover:bg-white/[0.08] text-white/70 hover:text-white rounded-full px-8 py-6 font-display font-bold tracking-wide transition-all duration-300 text-base"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5 mr-2"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Demander un devis
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>

        {/* ─── Bottom tagline ─── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 1.1 }}
          className="mt-16 md:mt-20 text-center"
        >
          <div className="flex items-center justify-center gap-3 text-white/20">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-[oklch(0.68_0.12_85/30%)]" />
            <Zap className="size-3" />
            <span className="text-[10px] font-display font-bold tracking-[0.35em] uppercase">
              Innovation Digitale — Kinshasa &amp; Afrique
            </span>
            <Zap className="size-3" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-[oklch(0.68_0.12_85/30%)]" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
