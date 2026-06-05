'use client'

import { useRef, useMemo } from 'react'
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
  type LucideIcon,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

/* ─── Types ─── */
interface TimelineEvent {
  id: string
  time: string
  activity: string
  location?: string | null
  description?: string | null
  icon?: string | null
  order: number
}

/* ─── Map activity keywords to icon name string ─── */
function getEventIconName(activity: string): string {
  const lower = activity.toLowerCase()
  if (lower.includes('église') || lower.includes('cérémonie') || lower.includes('church') || lower.includes('mariage'))
    return 'church'
  if (lower.includes('musique') || lower.includes('dance') || lower.includes('danse') || lower.includes('music') || lower.includes('dj') || lower.includes('soirée'))
    return 'music'
  if (lower.includes('repas') || lower.includes('dîner') || lower.includes('dinner') || lower.includes('buffet') || lower.includes('cocktail') || lower.includes('réception'))
    return 'utensils'
  if (lower.includes('gâteau') || lower.includes('cake') || lower.includes('dessert'))
    return 'cake'
  if (lower.includes('photo') || lower.includes('préparatifs') || lower.includes('séance') || lower.includes('camera'))
    return 'camera'
  if (lower.includes('champagne') || lower.includes('toast') || lower.includes('vin') || lower.includes('accueil'))
    return 'wine'
  if (lower.includes('vœux') || lower.includes('coeur') || lower.includes('amour'))
    return 'heart'
  if (lower.includes('feu') || lower.includes('artifice') || lower.includes('sparkle') || lower.includes('entrée'))
    return 'sparkles'
  return 'wine'
}

/* ─── Static icon renderer by name ─── */
const ICON_MAP: Record<string, LucideIcon> = {
  church: Church,
  music: Music,
  utensils: UtensilsCrossed,
  cake: Cake,
  camera: Camera,
  wine: Wine,
  heart: Heart,
  sparkles: Sparkles,
}

/* ─── Gold color constants ─── */
const GOLD = '#C4A265'
const GOLD_LIGHT = 'rgba(196, 162, 101, 0.15)'
const GOLD_MID = 'rgba(196, 162, 101, 0.25)'
const GOLD_GLOW = 'rgba(196, 162, 101, 0.40)'

/* ─── Floating sparkle particles ─── */
function FloatingParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 1,
        duration: Math.random() * 7 + 8,
        delay: Math.random() * 5,
        opacity: Math.random() * 0.3 + 0.08,
      })),
    [],
  )

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, ${GOLD} 0%, transparent 70%)`,
          }}
          animate={{
            y: [0, -25, 0],
            opacity: [p.opacity, p.opacity * 1.5, p.opacity],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/* ─── Ornamental gold divider ─── */
function GoldDivider() {
  return (
    <div className="flex items-center justify-center gap-3 py-1" aria-hidden="true">
      <motion.div
        className="h-px w-10 sm:w-14"
        style={{ background: `linear-gradient(to right, transparent, ${GOLD}40)` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      />
      <span className="text-xs tracking-[0.25em]" style={{ color: `${GOLD}60` }}>✦</span>
      <motion.div
        className="h-px w-10 sm:w-14"
        style={{ background: `linear-gradient(to left, transparent, ${GOLD}40)` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      />
    </div>
  )
}

/* ─── Pulsing dot connector ─── */
function PulsingDot({ inView, delay }: { inView: boolean; delay: number }) {
  return (
    <motion.div
      className="absolute left-4 md:left-1/2 -translate-x-1/2 z-10"
      initial={{ scale: 0, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : {}}
      transition={{ delay, duration: 0.5, type: 'spring', stiffness: 200 }}
    >
      <div className="relative flex items-center justify-center">
        {/* Outer glow ring */}
        <motion.div
          className="absolute w-10 h-10 rounded-full"
          style={{
            background: `radial-gradient(circle, ${GOLD}20, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: delay + 0.5,
          }}
        />
        {/* Glass circle */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            border: `1.5px solid ${GOLD_MID}`,
            boxShadow: `0 0 12px ${GOLD}20, inset 0 0 8px ${GOLD}10`,
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${GOLD}, #D4B87A)`,
              boxShadow: `0 0 6px ${GOLD_GLOW}`,
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Grand finale dot (last event) ─── */
function GrandFinaleDot({ inView, delay }: { inView: boolean; delay: number }) {
  return (
    <motion.div
      className="absolute left-4 md:left-1/2 -translate-x-1/2 z-10"
      initial={{ scale: 0, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : {}}
      transition={{ delay, duration: 0.7, type: 'spring', stiffness: 150 }}
    >
      <div className="relative flex items-center justify-center">
        {/* Dramatic outer glow */}
        <motion.div
          className="absolute w-16 h-16 rounded-full"
          style={{
            background: `radial-gradient(circle, ${GOLD}30, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: delay + 0.5,
          }}
        />
        {/* Secondary ring */}
        <motion.div
          className="absolute w-12 h-12 rounded-full"
          style={{
            border: `1px solid ${GOLD}30`,
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: delay + 0.3,
          }}
        />
        {/* Glass circle */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, #D4B87A)`,
            boxShadow: `0 0 24px ${GOLD_GLOW}, 0 4px 16px ${GOLD}30`,
          }}
        >
          <Heart className="w-4 h-4 text-white fill-white" />
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Activity icon renderer (declared outside render) ─── */
function ActivityIcon({ iconName }: { iconName: string }) {
  const Icon = ICON_MAP[iconName] || Wine
  return <Icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: GOLD }} />
}

/* ─── Event Card ─── */
function TimelineCard({
  event,
  index,
  isLast,
  isLeft,
  inView,
}: {
  event: TimelineEvent
  index: number
  isLast: boolean
  isLeft: boolean
  inView: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const cardInView = useInView(cardRef, { once: true, margin: '-40px' })

  // Determine icon: use emoji from DB if available, otherwise derive from activity
  const emojiIcon = event.icon
  const iconName = getEventIconName(event.activity)

  const slideDirection = isLeft ? -50 : 50
  const baseDelay = 0.15 + index * 0.18

  return (
    <motion.div
      ref={cardRef}
      className={`relative flex items-start mb-16 last:mb-0 ${
        isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
      } flex-row`}
      initial={{ opacity: 0, x: slideDirection, y: 15 }}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ delay: baseDelay, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Dot connector */}
      {isLast ? (
        <GrandFinaleDot inView={cardInView} delay={baseDelay} />
      ) : (
        <PulsingDot inView={cardInView} delay={baseDelay} />
      )}

      {/* Content card */}
      <div
        className={`ml-14 md:ml-0 md:w-[calc(50%-2.5rem)] ${
          isLeft ? 'md:pr-6 md:mr-auto' : 'md:pl-6 md:ml-auto'
        }`}
      >
        <motion.div
          className="relative rounded-2xl overflow-hidden group"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${GOLD}20`,
            boxShadow: `0 8px 32px ${GOLD}08, inset 0 1px 0 ${GOLD}10`,
          }}
          whileHover={{
            boxShadow: `0 12px 40px ${GOLD}15, inset 0 1px 0 ${GOLD}20`,
            borderColor: `${GOLD}40`,
          }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-5 sm:p-6 md:p-7">
            {/* Top row: Icon + Time */}
            <div className="flex items-start gap-4 mb-4">
              {/* Icon container */}
              <motion.div
                className="shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD_MID})`,
                  border: `1.5px solid ${GOLD}30`,
                  boxShadow: `0 0 16px ${GOLD}15`,
                }}
                initial={{ scale: 0, rotate: -20 }}
                animate={cardInView ? { scale: 1, rotate: 0 } : {}}
                transition={{ delay: baseDelay + 0.2, duration: 0.5, type: 'spring', stiffness: 180 }}
              >
                {emojiIcon ? (
                  <span className="text-xl sm:text-2xl leading-none" role="img" aria-label={event.activity}>
                    {emojiIcon}
                  </span>
                ) : (
                  <ActivityIcon iconName={iconName} />
                )}
              </motion.div>

              {/* Time display */}
              <div className="flex-1 min-w-0">
                <motion.div
                  className="font-serif text-2xl sm:text-3xl font-bold tracking-wide"
                  style={{
                    color: GOLD,
                    textShadow: `0 0 20px ${GOLD}30`,
                  }}
                  animate={
                    cardInView
                      ? {
                          textShadow: [
                            `0 0 20px ${GOLD}30`,
                            `0 0 30px ${GOLD}50`,
                            `0 0 20px ${GOLD}30`,
                          ],
                        }
                      : {}
                  }
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: baseDelay + 1,
                  }}
                >
                  {event.time}
                </motion.div>
              </div>
            </div>

            {/* Gold divider line */}
            <motion.div
              className="h-px mb-4"
              style={{
                background: `linear-gradient(to right, ${GOLD}40, ${GOLD}15, transparent)`,
              }}
              initial={{ scaleX: 0, originX: 0 }}
              animate={cardInView ? { scaleX: 1 } : {}}
              transition={{ delay: baseDelay + 0.3, duration: 0.6 }}
            />

            {/* Activity / Title */}
            <motion.h3
              className="font-serif text-lg sm:text-xl font-bold text-foreground mb-2 leading-snug"
              initial={{ opacity: 0, y: 8 }}
              animate={cardInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: baseDelay + 0.35, duration: 0.5 }}
            >
              {event.activity}
            </motion.h3>

            {/* Description */}
            {event.description && (
              <motion.p
                className="text-sm sm:text-[15px] text-muted-foreground/75 font-display leading-relaxed mb-3"
                initial={{ opacity: 0, y: 8 }}
                animate={cardInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: baseDelay + 0.45, duration: 0.5 }}
              >
                {event.description}
              </motion.p>
            )}

            {/* Location */}
            {event.location && (
              <motion.div
                className="flex items-start gap-2 text-sm text-muted-foreground/65 font-display"
                initial={{ opacity: 0, y: 8 }}
                animate={cardInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: baseDelay + 0.55, duration: 0.5 }}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: `${GOLD}90` }} />
                <span className="leading-snug">{event.location}</span>
              </motion.div>
            )}

            {/* Grand finale extra ornamentation */}
            {isLast && (
              <motion.div
                className="mt-5 flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={cardInView ? { opacity: 1 } : {}}
                transition={{ delay: baseDelay + 0.7, duration: 0.6 }}
              >
                <div
                  className="h-px w-8"
                  style={{ background: `linear-gradient(to right, transparent, ${GOLD}40)` }}
                />
                <Heart className="w-3 h-3 fill-current" style={{ color: `${GOLD}60` }} />
                <div
                  className="h-px w-8"
                  style={{ background: `linear-gradient(to left, transparent, ${GOLD}40)` }}
                />
              </motion.div>
            )}
          </div>

          {/* Subtle top-right corner ornament */}
          <div
            className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 100% 0%, ${GOLD}08, transparent 70%)`,
            }}
            aria-hidden="true"
          />
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ─── Main Component ─── */
export default function EventTimeline({ events }: { events: TimelineEvent[] }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })

  // Empty state
  if (!events || events.length === 0) {
    return (
      <section id="programme" ref={sectionRef} className="relative py-24 md:py-36 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-[#C4A265]/[0.03] to-background" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Decorative icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-8"
            style={{
              background: GOLD_LIGHT,
              boxShadow: `0 0 40px ${GOLD}10`,
            }}
          >
            <Clock className="w-8 h-8" style={{ color: GOLD }} />
          </motion.div>

          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, ${GOLD}, #B05A5A, ${GOLD})`,
              }}
            >
              Programme du Jour
            </span>
          </h2>
          <p className="font-display text-lg text-muted-foreground/60 max-w-md mx-auto">
            Le programme de la journée sera bientôt disponible
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="programme" ref={sectionRef} className="relative py-24 md:py-36 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-[#C4A265]/[0.03] to-background" />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at top left, ${GOLD}06, transparent 50%)`,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at bottom right, ${GOLD}04, transparent 50%)`,
        }}
        aria-hidden="true"
      />

      {/* Floating sparkles */}
      <FloatingParticles />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* ─── Section Header ─── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-16 md:mb-24"
        >
          {/* Decorative icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="inline-flex items-center justify-center w-18 h-18 sm:w-20 sm:h-20 rounded-full mb-8"
            style={{
              background: `linear-gradient(135deg, ${GOLD_LIGHT}, rgba(176,90,90,0.08))`,
              boxShadow: `0 0 40px ${GOLD}10`,
            }}
          >
            <Clock className="w-8 h-8 sm:w-9 sm:h-9" style={{ color: GOLD }} />
          </motion.div>

          {/* Title */}
          <motion.h2
            className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold mb-5"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.25 }}
          >
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, ${GOLD}, #B05A5A, ${GOLD})`,
              }}
            >
              Programme du Jour
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            className="font-display text-lg sm:text-xl text-muted-foreground/60 max-w-xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Chaque moment a été pensé avec amour pour vous
          </motion.p>

          {/* Flourish divider */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.9, delay: 0.55 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <div
              className="h-px w-16 sm:w-24"
              style={{ background: `linear-gradient(to right, transparent, ${GOLD}40)` }}
            />
            <span className="text-xs tracking-[0.3em] uppercase font-display" style={{ color: `${GOLD}60` }}>
              ✦
            </span>
            <div
              className="h-px w-16 sm:w-24"
              style={{ background: `linear-gradient(to left, transparent, ${GOLD}40)` }}
            />
          </motion.div>
        </motion.div>

        {/* ─── Timeline ─── */}
        <div className="relative max-w-4xl mx-auto">
          {/* Glowing gold central line */}
          <motion.div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px md:-translate-x-px"
            style={{
              background: `linear-gradient(to bottom, transparent, ${GOLD}30, ${GOLD}50, ${GOLD}30, transparent)`,
              boxShadow: `0 0 8px ${GOLD}20`,
            }}
            initial={{ scaleY: 0, originY: 0 }}
            animate={isInView ? { scaleY: 1 } : {}}
            transition={{ duration: 1.5, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          />

          {/* Event cards */}
          {events.map((event, i) => {
            const isLeft = i % 2 === 0
            const isLast = i === events.length - 1

            return (
              <div key={event.id}>
                <TimelineCard
                  event={event}
                  index={i}
                  isLast={isLast}
                  isLeft={isLeft}
                  inView={isInView}
                />
                {/* Ornamental divider between cards (not after last) */}
                {!isLast && (
                  <div className="flex justify-center mb-4 md:mb-0">
                    <GoldDivider />
                  </div>
                )}
              </div>
            )
          })}

          {/* End marker — heart below the last card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: events.length * 0.18 + 0.6, duration: 0.7 }}
            className="flex justify-center mt-8"
          >
            <div
              className="flex items-center gap-3 px-5 py-2.5 rounded-full"
              style={{
                background: GOLD_LIGHT,
                border: `1px solid ${GOLD}20`,
                boxShadow: `0 0 20px ${GOLD}10`,
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />
              <span
                className="font-display text-xs sm:text-sm tracking-[0.15em] uppercase font-medium"
                style={{ color: `${GOLD}CC` }}
              >
                Josué &amp; Hornella
              </span>
              <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─── Skeleton Loading State ─── */
export function EventTimelineSkeleton() {
  return (
    <section className="relative py-24 md:py-36">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-[#C4A265]/[0.03] to-background" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header skeleton */}
        <div className="text-center mb-16 md:mb-24">
          <Skeleton className="w-20 h-20 rounded-full mx-auto mb-8" />
          <Skeleton className="h-10 sm:h-12 w-64 sm:w-80 mx-auto mb-4" />
          <Skeleton className="h-5 w-48 mx-auto mb-2" />
          <Skeleton className="h-px w-48 mx-auto mt-6" />
        </div>

        {/* Timeline skeleton */}
        <div className="max-w-4xl mx-auto space-y-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative mb-16">
              {/* Dot */}
              <div className="absolute left-4 md:left-1/2 -translate-x-1/2">
                <Skeleton className="w-8 h-8 rounded-full" />
              </div>
              {/* Card */}
              <div className="ml-14 md:ml-0 md:w-[calc(50%-2.5rem)] md:pr-6">
                <div
                  className="rounded-2xl p-5 sm:p-6 md:p-7"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${GOLD}15`,
                  }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-8 w-24 mb-1" />
                    </div>
                  </div>
                  <Skeleton className="h-px w-full mb-4" />
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
