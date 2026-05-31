'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ExternalLink, MessageCircle, Sparkles, Zap, Globe, Cpu, BarChart3, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'

const AENEWS_URL = 'https://aenews.net'
const WHATSAPP_DEVIS = 'https://wa.me/243816515095?text=Bonjour%2C%20je%20souhaite%20obtenir%20un%20devis%20pour%20une%20solution%20num%C3%A9rique.'

const capabilities = [
  { icon: Globe, label: 'Plateformes Web' },
  { icon: Cpu, label: 'Intelligence Artificielle' },
  { icon: BarChart3, label: 'Automatisation' },
  { icon: Palette, label: 'Design Premium' },
]

export default function AENEWSBanner() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-hidden"
    >
      {/* ─── Rich Background ─── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.14_0.02_270)] via-[oklch(0.12_0.03_270)] to-[oklch(0.10_0.04_270)]" />

      {/* Animated gradient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.68 0.12 85 / 15%) 0%, transparent 70%)',
          }}
        />
        <motion.div
          animate={{
            x: [0, -20, 0],
            y: [0, 15, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.08 30 / 10%) 0%, transparent 70%)',
          }}
        />
        <motion.div
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.68 0.12 85 / 5%) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(0.72 0.12 85 / 30%) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.12 85 / 30%) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top gold line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.68_0.12_85/40%)] to-transparent" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Logo + Brand ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-10"
        >
          {/* AE Monogram */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center justify-center mb-6"
          >
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.12_85/20%)] via-transparent to-[oklch(0.72_0.08_30/15%)] blur-lg" />
              {/* Logo container */}
              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-[oklch(0.68_0.12_85)] to-[oklch(0.58_0.14_75)] flex items-center justify-center shadow-2xl shadow-[oklch(0.68_0.12_85/30%)]">
                <span className="font-serif text-2xl md:text-3xl font-bold text-white">AE</span>
              </div>
            </div>
          </motion.div>

          {/* Brand name */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h3 className="font-serif text-2xl md:text-4xl font-bold mb-2">
              <span className="text-white">Conçu et développé par </span>
              <span className="bg-gradient-to-r from-[oklch(0.82_0.08_85)] via-[oklch(0.68_0.12_85)] to-[oklch(0.72_0.08_30)] bg-clip-text text-transparent">
                AENEWS
              </span>
            </h3>

            <div className="flex items-center justify-center gap-2 mt-2 mb-4">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-[oklch(0.68_0.12_85/40%)]" />
              <span className="text-xs font-display tracking-[0.3em] uppercase text-[oklch(0.72_0.12_85/60%)]">
                Meilleur qu&apos;hier
              </span>
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-[oklch(0.68_0.12_85/40%)]" />
            </div>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="font-display text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed"
          >
            Solutions numériques, plateformes intelligentes, automatisation et innovation digitale pour particuliers, entreprises et organisations.
          </motion.p>
        </motion.div>

        {/* ─── Capabilities Row ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-10"
        >
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.label}
              initial={{ opacity: 0, y: 15 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 + i * 0.08, duration: 0.5 }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.05] hover:border-[oklch(0.68_0.12_85/20%)] transition-all duration-300 group"
            >
              <cap.icon className="size-5 text-[oklch(0.68_0.12_85/70%)] group-hover:text-[oklch(0.82_0.08_85)] transition-colors" />
              <span className="text-xs font-display text-white/40 group-hover:text-white/60 transition-colors">
                {cap.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Description ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="max-w-3xl mx-auto text-center mb-10"
        >
          <p className="font-display text-sm md:text-base text-white/30 leading-relaxed">
            AENEWS accompagne les entreprises, entrepreneurs, organisateurs d&apos;événements et institutions dans la création de plateformes web modernes, applications métiers, solutions d&apos;automatisation, intelligence artificielle, marketing digital et transformation numérique.
          </p>
        </motion.div>

        {/* ─── CTA Buttons ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          {/* Primary: Discover AENEWS */}
          <a
            href={AENEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative"
          >
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-[oklch(0.68_0.12_85/20%)] to-[oklch(0.72_0.08_30/15%)] blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Button
              size="lg"
              className="relative bg-gradient-to-r from-[oklch(0.68_0.12_85)] to-[oklch(0.58_0.14_75)] hover:from-[oklch(0.72_0.12_85)] hover:to-[oklch(0.62_0.14_75)] text-white shadow-xl shadow-[oklch(0.68_0.12_85/20%)] hover:shadow-2xl hover:shadow-[oklch(0.68_0.12_85/30%)] transition-all duration-300 rounded-full px-8 py-6 font-display tracking-wide"
            >
              <Sparkles className="size-4 mr-2" />
              Découvrir AENEWS
              <ExternalLink className="size-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
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
              className="relative border-white/15 hover:border-[oklch(0.68_0.12_85/40%)] bg-white/[0.03] hover:bg-white/[0.08] text-white/70 hover:text-white rounded-full px-8 py-6 font-display tracking-wide transition-all duration-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 mr-2"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Demander un devis
            </Button>
          </a>
        </motion.div>

        {/* ─── Bottom tagline ─── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 1.1 }}
          className="mt-10 text-center"
        >
          <div className="flex items-center justify-center gap-2 text-white/20">
            <Zap className="size-3" />
            <span className="text-[10px] font-display tracking-[0.3em] uppercase">
              Innovation Digitale — Kinshasa &amp; Afrique
            </span>
            <Zap className="size-3" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
