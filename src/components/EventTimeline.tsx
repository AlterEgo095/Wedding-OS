'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Church,
  Music,
  UtensilsCrossed,
  Cake,
  Camera,
  Wine,
  Heart,
  Sparkles,
  MapPin,
  Clock,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface TimelineEvent {
  id: string
  time: string
  activity: string
  location?: string | null
  description?: string | null
  order: number
}

// Map activity keywords to icons
function getEventIcon(activity: string) {
  const lower = activity.toLowerCase()
  if (lower.includes('église') || lower.includes('cérémonie') || lower.includes('church') || lower.includes('mariage'))
    return Church
  if (lower.includes('musique') || lower.includes('dance') || lower.includes('danse') || lower.includes('music') || lower.includes('dj') || lower.includes('soirée'))
    return Music
  if (lower.includes('repas') || lower.includes('dîner') || lower.includes('dinner') || lower.includes('buffet') || lower.includes('cocktail') || lower.includes('réception'))
    return UtensilsCrossed
  if (lower.includes('gâteau') || lower.includes('cake') || lower.includes('dessert'))
    return Cake
  if (lower.includes('photo') || lower.includes('camera'))
    return Camera
  if (lower.includes('champagne') || lower.includes('toast') || lower.includes('vin') || lower.includes('accueil'))
    return Wine
  if (lower.includes('vœux') || lower.includes('coeur') || lower.includes('amour'))
    return Heart
  if (lower.includes('feu') || lower.includes('artifice') || lower.includes('sparkle') || lower.includes('entrée'))
    return Sparkles
  return Wine
}

const iconColors = [
  'text-amber-500',
  'text-rose-500',
  'text-emerald-500',
  'text-purple-500',
  'text-teal-500',
  'text-gold',
]

export default function EventTimeline({ events }: { events: TimelineEvent[] }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  if (!events || events.length === 0) {
    return (
      <section id="programme" ref={sectionRef} className="py-20 md:py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Programme</span>
          </h2>
          <div className="section-divider max-w-xs mx-auto my-6">
            <span className="flourish text-sm">✦</span>
          </div>
          <p className="font-display text-lg text-muted-foreground">
            Le programme de la journée sera bientôt disponible
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="programme" ref={sectionRef} className="py-20 md:py-32 relative">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-champagne/10 to-transparent dark:via-champagne/5" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Programme du Jour</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Chaque moment a été pensé avec amour pour vous
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Timeline */}
        <div className="relative max-w-4xl mx-auto">
          {/* Central line */}
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gold/20 via-gold/40 to-gold/20 md:-translate-x-px" />

          {events.map((event, i) => {
            const Icon = getEventIcon(event.activity)
            const isLeft = i % 2 === 0
            const colorClass = iconColors[i % iconColors.length]

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.6, ease: 'easeOut' }}
                className={`relative flex items-start mb-12 last:mb-0 ${
                  isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                } flex-row`}
              >
                {/* Timeline dot */}
                <div className="absolute left-4 md:left-1/2 -translate-x-1/2 z-10">
                  <div className="w-8 h-8 rounded-full glass-card gold-border flex items-center justify-center animate-pulse-gold">
                    <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                  </div>
                </div>

                {/* Content card */}
                <div
                  className={`ml-12 md:ml-0 md:w-[calc(50%-2rem)] ${
                    isLeft ? 'md:pr-4 md:mr-auto' : 'md:pl-4 md:ml-auto'
                  }`}
                >
                  <div className="glass-card p-6 rounded-xl group hover:shadow-lg hover:shadow-gold/5 transition-all duration-300">
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 p-2 rounded-lg bg-gold/10 ${colorClass}`}>
                        <Icon className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Time */}
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="size-3.5 text-gold/60" />
                          <span className="text-sm font-display font-semibold text-gold tracking-wide">
                            {event.time}
                          </span>
                        </div>

                        {/* Activity */}
                        <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                          {event.activity}
                        </h3>

                        {/* Location */}
                        {event.location && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="font-display">{event.location}</span>
                          </div>
                        )}

                        {/* Description */}
                        {event.description && (
                          <p className="text-sm text-muted-foreground/80 font-display leading-relaxed">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}

          {/* End marker */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: events.length * 0.12 + 0.3, duration: 0.5 }}
            className="absolute left-4 md:left-1/2 -translate-x-1/2 bottom-0"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center shadow-lg shadow-gold/20">
              <Heart className="size-4 text-white fill-white" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function EventTimelineSkeleton() {
  return (
    <section className="py-20 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-5 w-48 mx-auto" />
        </div>
        <div className="max-w-4xl mx-auto space-y-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-4">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 glass-card p-6 rounded-xl">
                <div className="flex gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
