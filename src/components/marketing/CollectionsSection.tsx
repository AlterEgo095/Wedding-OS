'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * CollectionsSection — SECTION 4
 *
 * Displays Collections from the REAL DB (passed as props from the Server
 * Component). No hardcoded collection cards. Each card shows:
 *   - name, description
 *   - category (LUXURY, CLASSIC, AFRICAN, MINIMAL, DESTINATION)
 *   - tier (FREE, PREMIUM, EXCLUSIVE)
 *   - primary color (extracted from themeSeed JSON)
 *   - layout (extracted from themeSeed JSON)
 *
 * CTA "Voir l'expérience" links to a demo event using that Collection (if one
 * exists in the portfolio). Otherwise links to /collections anchor.
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

function parseThemeSeed(themeSeed: string): { primaryColor: string; layout: string } {
  try {
    const seed = JSON.parse(themeSeed)
    return {
      primaryColor: seed.primaryColor || '#D4A853',
      layout: seed.layout || 'classic',
    }
  } catch {
    return { primaryColor: '#D4A853', layout: 'classic' }
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  LUXURY: 'Luxe',
  CLASSIC: 'Classique',
  AFRICAN: 'Africain',
  MINIMAL: 'Minimal',
  DESTINATION: 'Destination',
}

const LAYOUT_DESCRIPTIONS: Record<string, string> = {
  royal: '6 sections — Cinématique',
  classic: '6 sections — Classique',
  minimal: '4 sections — Épuré (sans galerie, sans carte)',
  destination: '6 sections — Galerie avant récit',
  modern: '5 sections — Moderne (sans carte)',
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
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Design OS
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="gold-gradient">Collections Premium</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Chaque Collection est un <strong className="text-foreground">système visuel complet</strong> —
            pas juste des couleurs. Elles contrôlent la structure, l'ordre et la présence des sections.
          </p>
        </motion.div>

        {/* Collections grid — real data from DB */}
        {collections.length === 0 ? (
          <p className="text-center text-muted-foreground">Aucune Collection disponible.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {collections.map((col, i) => {
              const { primaryColor, layout } = parseThemeSeed(col.themeSeed)
              return (
                <motion.div
                  key={col.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
                  className="group relative rounded-2xl overflow-hidden glass-card border border-gold/15 hover:border-gold/40 transition-all duration-500"
                >
                  {/* Color preview header */}
                  <div
                    className="relative h-32 md:h-40 overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 50%, ${primaryColor}99 100%)`,
                    }}
                  >
                    {/* Decorative pattern */}
                    <div className="absolute inset-0 opacity-20" style={{
                      backgroundImage: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.3) 0%, transparent 50%)`,
                    }} />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                      <div>
                        <span className="inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-black/30 text-white/90 backdrop-blur-sm">
                          {CATEGORY_LABELS[col.category] || col.category}
                        </span>
                      </div>
                      {col.tier !== 'FREE' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-white/20 text-white backdrop-blur-sm">
                          {col.tier}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 md:p-6">
                    <h3 className="font-serif text-xl font-bold text-foreground mb-2">
                      {col.name}
                    </h3>
                    <p className="font-display text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                      {col.description || `Collection ${col.name} — layout ${layout}.`}
                    </p>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-display text-xs text-gold/70 tracking-wide">
                        {LAYOUT_DESCRIPTIONS[layout] || `Layout: ${layout}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 rounded-full border border-gold/30" style={{ backgroundColor: primaryColor }} />
                      <code className="font-mono text-muted-foreground">{primaryColor}</code>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
