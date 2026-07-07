'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * ThreeWorldsSection — SECTION 8
 *
 * Structural proof of the Collection Engine. Shows that Collections control
 * NOT just colors, but the SECTION STRUCTURE of the public experience.
 *
 * Three demo events (created in Mission 4.0):
 *   - World A (Royal):    6 sections — hero, story, gallery, timeline, map, guest-auth
 *   - World B (Minimal):  4 sections — hero, story, timeline, guest-auth (NO gallery, NO map)
 *   - World C (Immersive): 6 sections — gallery BEFORE story (different order)
 *
 * This proves the manifest-driven renderer is REAL.
 */

const WORLDS = [
  {
    slug: 'world-a-royal',
    name: 'Royal',
    collection: 'Royal Gold',
    color: '#D4AF37',
    layout: 'royal',
    sections: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'Guest Auth'],
    count: 6,
    tagline: 'L\'expérience cinématique complète',
  },
  {
    slug: 'world-b-minimal',
    name: 'Minimal',
    collection: 'Nordic',
    color: '#B0C4DE',
    layout: 'minimal',
    sections: ['Hero', 'Story', 'Timeline', 'Guest Auth'],
    count: 4,
    tagline: 'L\'épuration structurelle — pas de galerie, pas de carte',
    highlight: 'PAS de galerie\nPAS de carte',
  },
  {
    slug: 'world-c-immersive',
    name: 'Immersive',
    collection: 'Sunset',
    color: '#FF6B6B',
    layout: 'destination',
    sections: ['Hero', 'Gallery', 'Story', 'Timeline', 'Map', 'Guest Auth'],
    count: 6,
    tagline: 'La galerie avant le récit — ordre éditorial différent',
    highlight: 'Galerie AVANT récit',
  },
]

export default function ThreeWorldsSection() {
  return (
    <section id="three-worlds" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.15_0.03_290/40)] to-background" />
      </div>

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Preuve du moteur
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Trois mondes,</span>{' '}
            <span className="gold-gradient">trois structures</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Pas seulement des couleurs qui changent. Les Collections contrôlent{' '}
            <strong className="text-foreground">quelles sections existent</strong> et{' '}
            <strong className="text-foreground">dans quel ordre</strong>. Même code, trois expériences structurellement différentes.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {WORLDS.map((world, i) => (
            <motion.div
              key={world.slug}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="group relative rounded-2xl overflow-hidden glass-card border border-gold/15 hover:border-gold/40 transition-all duration-500"
            >
              {/* Color header */}
              <div
                className="h-28 relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${world.color}, ${world.color}bb)` }}
              >
                <div className="absolute inset-0 opacity-25" style={{
                  backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 50%)`,
                }} />
                <div className="absolute bottom-3 left-4 right-4">
                  <span className="font-display text-[10px] tracking-[0.25em] uppercase text-white/80 font-bold">
                    Layout · {world.layout}
                  </span>
                </div>
                <div className="absolute top-3 right-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-black/30 text-white/90 backdrop-blur-sm">
                    {world.count} sections
                  </span>
                </div>
              </div>

              <div className="p-6">
                <h3 className="font-serif text-2xl font-bold text-foreground mb-1">
                  World {String.fromCharCode(65 + i)} — {world.name}
                </h3>
                <p className="font-display text-xs text-gold/70 mb-3">
                  Collection: {world.collection}
                </p>
                <p className="font-display text-sm text-muted-foreground mb-4 leading-relaxed">
                  {world.tagline}
                </p>

                {/* Section structure */}
                <div className="mb-4">
                  <div className="font-display text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Structure
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {world.sections.map((section, idx) => (
                      <span
                        key={section}
                        className="px-2 py-1 rounded text-[10px] font-mono bg-gold/10 border border-gold/20 text-foreground/80"
                      >
                        {idx + 1}. {section}
                      </span>
                    ))}
                  </div>
                </div>

                {world.highlight && (
                  <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="font-display text-xs text-amber-600 dark:text-amber-400 font-semibold whitespace-pre-line">
                      ⚡ {world.highlight}
                    </p>
                  </div>
                )}

                <Link
                  href={`/w/${world.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-display text-gold/80 hover:text-gold transition-colors group-hover:gap-2.5 transition-all"
                >
                  Voir l'expérience
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
