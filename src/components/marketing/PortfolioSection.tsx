'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Star, FlaskConical } from 'lucide-react'

/**
 * PortfolioSection — SECTION 5
 *
 * Displays portfolio events from DB, with EXPLICIT classification:
 *   - REAL_CLIENT: actual client events (sarah-michael-prod)
 *   - DEMO: proof-of-concept events (world-a-royal, world-b-minimal, world-c-immersive)
 *
 * Never presents a demo as a real client, never hides the distinction.
 */

interface PortfolioEvent {
  slug: string
  coupleLabel: string
  collectionSlug: string | null
  collectionName: string | null
  collectionPrimaryColor: string | null
  layout: string | null
  weddingDate: Date | null
  venueCity: string | null
  isRealClient: boolean
  guestCount: number
}

interface Props {
  events: PortfolioEvent[]
}

function formatDate(date: Date | null): string {
  if (!date) return 'Date à confirmer'
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function PortfolioSection({ events }: Props) {
  if (events.length === 0) {
    return null // don't render an empty section
  }

  const realClients = events.filter((e) => e.isRealClient)
  const demos = events.filter((e) => !e.isRealClient)

  return (
    <section id="experiences" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Réalisations
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Des expériences</span>{' '}
            <span className="gold-gradient">déployées et vivantes</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Chaque expérience est indépendante, avec sa propre Collection, son propre manifeste et son propre rendu.
          </p>
        </motion.div>

        {/* Real clients */}
        {realClients.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Star className="size-4 text-gold" />
              <h3 className="font-display text-sm tracking-[0.2em] uppercase text-foreground font-bold">
                Expériences client
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {realClients.map((event, i) => (
                <EventCard key={event.slug} event={event} delay={i * 0.1} />
              ))}
            </div>
          </div>
        )}

        {/* Demos */}
        {demos.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <FlaskConical className="size-4 text-sky-500" />
              <h3 className="font-display text-sm tracking-[0.2em] uppercase text-foreground font-bold">
                Démonstrations techniques
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {demos.map((event, i) => (
                <EventCard key={event.slug} event={event} delay={i * 0.1} isDemo />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function EventCard({ event, delay = 0, isDemo = false }: { event: PortfolioEvent; delay?: number; isDemo?: boolean }) {
  const color = event.collectionPrimaryColor || '#D4A853'
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <Link
        href={`/w/${event.slug}`}
        className="group block rounded-2xl overflow-hidden glass-card border border-gold/15 hover:border-gold/40 transition-all duration-500 h-full"
      >
        {/* Color band */}
        <div
          className="h-20 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        >
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `radial-gradient(circle at 30% 50%, rgba(255,255,255,0.3) 0%, transparent 60%)`,
          }} />
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider backdrop-blur-sm ${
              isDemo ? 'bg-sky-500/30 text-sky-100' : 'bg-emerald-500/30 text-emerald-100'
            }`}>
              {isDemo ? 'DÉMO' : 'CLIENT'}
            </span>
          </div>
        </div>

        <div className="p-5">
          <h4 className="font-serif text-lg font-bold text-foreground mb-1">
            {event.coupleLabel}
          </h4>
          <p className="font-display text-xs text-muted-foreground mb-3">
            {formatDate(event.weddingDate)}{event.venueCity ? ` · ${event.venueCity}` : ''}
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="font-display text-gold/70">
              {event.collectionName || 'Collection par défaut'}
            </span>
            <span className="font-mono text-muted-foreground">
              {event.layout || 'classic'}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-display text-gold/80 group-hover:gap-2 transition-all">
            Voir l'expérience
            <ArrowRight className="size-3" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
