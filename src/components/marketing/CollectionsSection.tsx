'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Check, Monitor, Smartphone, Tablet } from 'lucide-react'

/**
 * CollectionsSection — SECTION 4
 * 
 * PREMIUM VISUAL GALLERY — Theme Engine 2.0
 * 
 * Transforms simple collection cards into immersive theme showcase cards
 * comparable to Figma Community / Framer Templates / Webflow Showcase.
 * 
 * Each card features:
 *   - Hero preview with gradient + decorative pattern
 *   - Theme name in display font
 *   - Color palette dots
 *   - Typography preview
 *   - Feature list (sections included)
 *   - Device mockup indicators
 *   - "Preview" + "Use Theme" CTAs
 */

interface CollectionData {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnailUrl: string | null
  category: string
  tier: string
  themeSeed: string
}

interface Props {
  collections: CollectionData[]
}

interface ParsedTheme {
  primaryColor: string
  accentColor: string
  fontDisplay: string
  fontBody: string
  layout: string
}

function parseThemeSeed(themeSeed: string): ParsedTheme {
  try {
    const seed = JSON.parse(themeSeed)
    return {
      primaryColor: seed.primaryColor || '#D4A853',
      accentColor: seed.accentColor || '#1a1a2e',
      fontDisplay: seed.fontDisplay || 'Cormorant Garamond',
      fontBody: seed.fontBody || 'Inter',
      layout: seed.layout || 'classic',
    }
  } catch {
    return {
      primaryColor: '#D4A853',
      accentColor: '#1a1a2e',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      layout: 'classic',
    }
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  LUXURY: 'Luxe',
  CLASSIC: 'Classique',
  AFRICAN: 'Africain',
  MINIMAL: 'Minimal',
  DESTINATION: 'Destination',
  CUSTOM: 'Personnalisé',
}

const LAYOUT_FEATURES: Record<string, string[]> = {
  royal: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  classic: ['Hero', 'Story', 'Gallery', 'Timeline', 'Map', 'RSVP'],
  minimal: ['Hero', 'Story', 'Timeline', 'RSVP'],
  destination: ['Hero', 'Gallery', 'Story', 'Timeline', 'Map', 'RSVP'],
  modern: ['Hero', 'Timeline', 'Gallery', 'Story', 'RSVP'],
}

const TIER_STYLES: Record<string, string> = {
  FREE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PREMIUM: 'bg-gold/20 text-gold border-gold/40',
  EXCLUSIVE: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

export default function CollectionsSection({ collections }: Props) {
  return (
    <section id="collections" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Premium backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[oklch(0.15_0.03_290/30)] to-background" />
      </div>

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-widest uppercase text-gold bg-gold/10 border border-gold/20 mb-4">
            Bibliothèque de Thèmes
          </span>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4">
            Choisissez votre expérience
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-2xl mx-auto">
            Des collections premium conçues pour sublimer votre mariage. Chaque thème est une expérience visuelle complète.
          </p>
        </motion.div>

        {collections.length === 0 ? (
          <p className="text-center text-muted-foreground">Aucune Collection disponible.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {collections.map((col, i) => {
              const theme = parseThemeSeed(col.themeSeed)
              const features = LAYOUT_FEATURES[theme.layout] || LAYOUT_FEATURES.classic
              
              return (
                <motion.div
                  key={col.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: (i % 3) * 0.12 }}
                  className="group relative rounded-3xl overflow-hidden glass-card border border-white/10 hover:border-gold/40 transition-all duration-500 hover:shadow-2xl hover:shadow-gold/10"
                  whileHover={{ y: -4 }}
                >
                  {/* ═══ IMMERSIVE HERO PREVIEW ═══ */}
                  <div
                    className="relative h-56 md:h-64 overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.primaryColor}cc 40%, ${theme.accentColor} 100%)`,
                    }}
                  >
                    {/* Decorative mesh pattern */}
                    <div className="absolute inset-0 opacity-30" style={{
                      backgroundImage: `
                        radial-gradient(circle at 20% 30%, rgba(255,255,255,0.3) 0%, transparent 40%),
                        radial-gradient(circle at 80% 70%, rgba(0,0,0,0.4) 0%, transparent 40%),
                        radial-gradient(circle at 50% 50%, ${theme.accentColor}40 0%, transparent 60%)
                      `,
                    }} />
                    
                    {/* Typography preview — simulates the actual wedding page hero */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <div
                        className="text-2xl md:text-3xl font-bold mb-1 opacity-90"
                        style={{
                          fontFamily: `'${theme.fontDisplay}', serif`,
                          color: '#FFFFFF',
                          textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                      >
                        {col.name}
                      </div>
                      <div
                        className="text-[10px] tracking-[0.2em] uppercase opacity-70 mb-2"
                        style={{ fontFamily: `'${theme.fontBody}', sans-serif`, color: '#FFFFFF' }}
                      >
                        15 Juin 2027
                      </div>
                      <div
                        className="w-12 h-px mb-2"
                        style={{ background: `${theme.accentColor}80` }}
                      />
                      <div
                        className="text-[9px] opacity-60"
                        style={{ fontFamily: `'${theme.fontBody}', sans-serif`, color: '#FFFFFF' }}
                      >
                        Château de Versailles
                      </div>
                    </div>

                    {/* Category badge */}
                    <div className="absolute top-3 left-3">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider bg-black/40 text-white/90 backdrop-blur-md border border-white/10">
                        {CATEGORY_LABELS[col.category] || col.category}
                      </span>
                    </div>

                    {/* Tier badge */}
                    <div className="absolute top-3 right-3">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider backdrop-blur-md border ${TIER_STYLES[col.tier] || TIER_STYLES.FREE}`}>
                        {col.tier}
                      </span>
                    </div>

                    {/* Device mockup indicators */}
                    <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                      <Monitor className="w-3.5 h-3.5 text-white" />
                      <Tablet className="w-3.5 h-3.5 text-white" />
                      <Smartphone className="w-3.5 h-3.5 text-white" />
                    </div>

                    {/* Hover zoom overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-500" />
                  </div>

                  {/* ═══ CONTENT SECTION ═══ */}
                  <div className="p-5 md:p-6 space-y-4">
                    {/* Theme name + description */}
                    <div>
                      <h3 className="font-serif text-xl font-bold text-foreground mb-1.5">
                        {col.name}
                      </h3>
                      <p className="font-display text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {col.description || `Collection ${col.name} — layout ${theme.layout}.`}
                      </p>
                    </div>

                    {/* Color palette */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Palette</span>
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.primaryColor }}
                        title={`Primary: ${theme.primaryColor}`}
                      />
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.accentColor }}
                        title={`Accent: ${theme.accentColor}`}
                      />
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white/20 shadow-sm"
                        style={{ backgroundColor: '#FAF8F5' }}
                        title="Background"
                      />
                      <code className="text-[9px] font-mono text-muted-foreground/60 ml-1">
                        {theme.primaryColor}
                      </code>
                    </div>

                    {/* Typography preview */}
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Fonts</span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold"
                          style={{ fontFamily: `'${theme.fontDisplay}', serif` }}
                        >
                          {theme.fontDisplay}
                        </span>
                        <span className="text-muted-foreground/40">+</span>
                        <span
                          className="text-xs"
                          style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
                        >
                          {theme.fontBody}
                        </span>
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="flex flex-wrap gap-1.5">
                      {features.map(feat => (
                        <span key={feat} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[9px] bg-white/5 text-muted-foreground border border-white/5">
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          {feat}
                        </span>
                      ))}
                    </div>

                    {/* CTAs */}
                    <div className="flex gap-2 pt-1">
                      <Link
                        href={`/w/world-a-royal`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-white/5 text-foreground border border-white/10 hover:bg-white/10 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Aperçu
                      </Link>
                      <Link
                        href="/onboarding"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`,
                        }}
                      >
                        Choisir
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12"
        >
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20 transition-all"
          >
            Voir tous les thèmes
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

// Need Eye import
import { Eye } from 'lucide-react'
