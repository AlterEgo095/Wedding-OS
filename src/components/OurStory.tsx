'use client'

import { useRef, useMemo } from 'react'
import { motion, useInView } from 'framer-motion'
import Image from 'next/image'
import { Heart, Sparkles, Calendar } from 'lucide-react'

interface StoryEvent {
  id: string
  title: string
  description: string
  date?: string | null
  imageUrl?: string | null
  order: number
}

interface OurStoryProps {
  stories: StoryEvent[]
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const MILESTONE_ACCENTS = [
  { rose: '#B05A5A', light: 'rgba(176,90,90,0.12)', mid: 'rgba(176,90,90,0.25)', glow: 'rgba(176,90,90,0.15)' },
  { rose: '#C4A265', light: 'rgba(196,162,101,0.12)', mid: 'rgba(196,162,101,0.25)', glow: 'rgba(196,162,101,0.15)' },
  { rose: '#8B6914', light: 'rgba(139,105,20,0.12)', mid: 'rgba(139,105,20,0.25)', glow: 'rgba(139,105,20,0.15)' },
  { rose: '#5A8B5A', light: 'rgba(90,139,90,0.12)', mid: 'rgba(90,139,90,0.25)', glow: 'rgba(90,139,90,0.15)' },
]

const DEFAULT_STORIES: StoryEvent[] = [
  {
    id: 'default-1',
    title: 'Notre Première Rencontre',
    description: 'Le destin a croisé nos chemins un jour ordinaire, et depuis, rien n\'a plus jamais été pareil. Un regard, un sourire, et le monde entier s\'est arrêté de tourner le temps d\'un instant magique.',
    date: null,
    imageUrl: '/photos/couple-portrait.jpeg',
    order: 0,
  },
  {
    id: 'default-2',
    title: 'Le Premier « Je t\'aime »',
    description: 'Ces trois mots, murmurés avec le coeur qui bat la chamade, ont scellé une promesse silencieuse. L\'amour trouvait sa voix, et notre histoire prenait tout son sens.',
    date: null,
    imageUrl: '/photos/couple-bridge.jpeg',
    order: 1,
  },
  {
    id: 'default-3',
    title: 'La Demande en Mariage',
    description: 'Un genou à terre, un anneau brillant, et des larmes de bonheur. Ce moment suspendu dans le temps restera gravé dans nos mémoires comme le plus beau de tous.',
    date: null,
    imageUrl: '/photos/couple-signing.jpeg',
    order: 2,
  },
  {
    id: 'default-4',
    title: 'Vers le Grand Jour',
    description: 'Et maintenant, nous marchons main dans la main vers le jour où nos deux vies ne feront plus qu\'une. L\'aventure ne fait que commencer, et le meilleur est à venir.',
    date: '26 Juin 2026',
    imageUrl: '/photos/couple-bouquet.jpeg',
    order: 3,
  },
]

/* ─── Floating sparkle particles ─── */
function FloatingParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1.5,
        duration: Math.random() * 6 + 8,
        delay: Math.random() * 5,
        opacity: Math.random() * 0.35 + 0.1,
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
            background: 'radial-gradient(circle, #C4A265 0%, transparent 70%)',
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [p.opacity, p.opacity * 1.6, p.opacity],
            scale: [1, 1.3, 1],
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

/* ─── Ornamental flourish divider ─── */
function OrnamentalDivider({ color = '#C4A265' }: { color?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2" aria-hidden="true">
      <motion.div
        className="h-px w-12 sm:w-16"
        style={{ background: `linear-gradient(to right, transparent, ${color}40)` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      />
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: `${color}80` }}>
        <path
          d="M12 2C12 2 14 6 14 8C14 10 12 12 12 12C12 12 10 10 10 8C10 6 12 2 12 2Z"
          fill="currentColor"
          opacity={0.5}
        />
        <path
          d="M12 22C12 22 10 18 10 16C10 14 12 12 12 12C12 12 14 14 14 16C14 18 12 22 12 22Z"
          fill="currentColor"
          opacity={0.5}
        />
        <path
          d="M2 12C2 12 6 10 8 10C10 10 12 12 12 12C12 12 10 14 8 14C6 14 2 12 2 12Z"
          fill="currentColor"
          opacity={0.5}
        />
        <path
          d="M22 12C22 12 18 14 16 14C14 14 12 12 12 12C12 12 14 10 16 10C18 10 22 12 22 12Z"
          fill="currentColor"
          opacity={0.5}
        />
      </svg>
      <motion.div
        className="h-px w-12 sm:w-16"
        style={{ background: `linear-gradient(to left, transparent, ${color}40)` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      />
    </div>
  )
}

/* ─── Image Card with parallax zoom ─── */
function MilestoneImage({
  src,
  alt,
  accent,
  inView,
}: {
  src: string
  alt: string
  accent: string
  inView: boolean
}) {
  return (
    <motion.div
      className="relative w-full aspect-[3/2] sm:aspect-[16/10] rounded-2xl overflow-hidden shadow-xl"
      style={{
        boxShadow: `0 25px 60px -15px ${accent}25`,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Parallax-like zoom on the image */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.08 }}
        animate={inView ? { scale: 1 } : { scale: 1.08 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 55vw"
          priority={false}
        />
      </motion.div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
      {/* Subtle shimmer */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${accent}10 0%, transparent 50%, ${accent}08 100%)`,
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  )
}

/* ─── Placeholder gradient when no image ─── */
function MilestonePlaceholder({ accent }: { accent: typeof MILESTONE_ACCENTS[0] }) {
  return (
    <div
      className="relative w-full aspect-[3/2] sm:aspect-[16/10] rounded-2xl overflow-hidden shadow-xl"
      style={{
        background: `linear-gradient(135deg, ${accent.light}, ${accent.mid}, ${accent.light})`,
        boxShadow: `0 25px 60px -15px ${accent.glow}`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Heart className="w-12 h-12" style={{ color: `${accent.rose}50` }} />
      </div>
    </div>
  )
}

/* ─── Main Component ─── */
export default function OurStory({ stories }: OurStoryProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })

  const milestones = stories.length > 0 ? stories : DEFAULT_STORIES

  return (
    <section
      ref={sectionRef}
      id="notre-histoire"
      className="relative py-24 md:py-36 overflow-hidden"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-[#C4A265]/[0.03] to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.68_0.12_85/0.04),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,oklch(0.55_0.10_150/0.03),transparent_50%)]" />

      {/* Floating sparkles */}
      <FloatingParticles />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* ─── Section Header ─── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-20 md:mb-28"
        >
          {/* Decorative icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="inline-flex items-center justify-center w-18 h-18 sm:w-20 sm:h-20 rounded-full mb-8"
            style={{
              background: 'linear-gradient(135deg, rgba(196,162,101,0.15), rgba(176,90,90,0.10))',
              boxShadow: '0 0 40px rgba(196,162,101,0.10)',
            }}
          >
            <Heart className="w-8 h-8 sm:w-9 sm:h-9 text-[#C4A265] fill-[#C4A265]/20" />
          </motion.div>

          {/* Title */}
          <motion.h2
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-5"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.25 }}
          >
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #C4A265, #B05A5A, #C4A265)',
              }}
            >
              Notre Histoire
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            className="font-display text-lg sm:text-xl text-muted-foreground/70 max-w-xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Un amour qui grandit chaque jour, une promesse d&apos;éternité
          </motion.p>

          {/* Flourish divider */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.9, delay: 0.55 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <div className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent via-[#C4A265]/40 to-[#C4A265]/40" />
            <span className="text-[#C4A265]/60 text-xs tracking-[0.3em] uppercase font-display">✦</span>
            <div className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent via-[#C4A265]/40 to-[#C4A265]/40" />
          </motion.div>
        </motion.div>

        {/* ─── Milestone Chapters ─── */}
        <div className="space-y-16 md:space-y-24">
          {milestones.map((milestone, i) => {
            const isReversed = i % 2 !== 0
            const accent = MILESTONE_ACCENTS[i % MILESTONE_ACCENTS.length]
            const chapterNum = ROMAN_NUMERALS[i % ROMAN_NUMERALS.length]

            return (
              <ChapterMilestone
                key={milestone.id}
                milestone={milestone}
                index={i}
                isReversed={isReversed}
                accent={accent}
                chapterNum={chapterNum}
              />
            )
          })}
        </div>

        {/* ─── Closing sentiment ─── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.9 }}
          className="text-center mt-20 md:mt-28"
        >
          <OrnamentalDivider color="#C4A265" />
          <div className="flex items-center justify-center gap-2.5 mt-6">
            <Sparkles className="w-4 h-4 text-[#C4A265]/50" />
            <p className="font-display text-sm sm:text-base tracking-[0.12em] uppercase text-muted-foreground/50">
              Et maintenant, c&apos;est à nous d&apos;écrire la suite
            </p>
            <Sparkles className="w-4 h-4 text-[#C4A265]/50" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Individual Chapter Milestone ─── */
function ChapterMilestone({
  milestone,
  index,
  isReversed,
  accent,
  chapterNum,
}: {
  milestone: StoryEvent
  index: number
  isReversed: boolean
  accent: typeof MILESTONE_ACCENTS[0]
  chapterNum: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const slideFrom = isReversed ? 60 : -60

  return (
    <div ref={ref} className="relative">
      {/* Ornamental divider above (except first) */}
      {index > 0 && <OrnamentalDivider color={accent.rose} />}

      <motion.div
        className={`
          flex flex-col gap-6 md:gap-10 lg:gap-14
          md:flex-row md:items-center
          ${isReversed ? 'md:flex-row-reverse' : ''}
        `}
      >
        {/* ─── Image Side ─── */}
        <div className="w-full md:w-[58%] lg:w-[60%]">
          {milestone.imageUrl ? (
            <MilestoneImage
              src={milestone.imageUrl}
              alt={milestone.title}
              accent={accent.rose}
              inView={inView}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8 }}
            >
              <MilestonePlaceholder accent={accent} />
            </motion.div>
          )}
        </div>

        {/* ─── Text Side ─── */}
        <div className="w-full md:w-[42%] lg:w-[40%]">
          <motion.div
            initial={{ opacity: 0, x: slideFrom, y: 15 }}
            animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative"
          >
            {/* Chapter label */}
            <motion.span
              className="inline-block font-display text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-semibold mb-3 sm:mb-4"
              style={{ color: `${accent.rose}99` }}
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.35 }}
            >
              Chapitre {chapterNum}
            </motion.span>

            {/* Title */}
            <motion.h3
              className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 leading-tight"
              style={{ color: accent.rose }}
              initial={{ opacity: 0, y: 15 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.45 }}
            >
              {milestone.title}
            </motion.h3>

            {/* Small decorative line */}
            <motion.div
              className="h-px w-10 sm:w-12 mb-4 sm:mb-5"
              style={{ background: `linear-gradient(to right, ${accent.rose}80, transparent)` }}
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.55 }}
            />

            {/* Description */}
            <motion.p
              className="font-display text-sm sm:text-base text-muted-foreground/75 leading-relaxed sm:leading-loose"
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.6 }}
            >
              {milestone.description}
            </motion.p>

            {/* Date badge */}
            {milestone.date && (
              <motion.div
                className="mt-5 sm:mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <span
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-display text-[11px] sm:text-xs tracking-[0.08em] font-medium"
                  style={{
                    background: accent.light,
                    border: `1px solid ${accent.mid}`,
                    color: accent.rose,
                  }}
                >
                  <Calendar className="w-3 h-3" />
                  {milestone.date}
                </span>
              </motion.div>
            )}

            {/* Subtle accent glow behind text */}
            <div
              className="absolute -inset-8 -z-10 rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${accent.glow}, transparent 70%)` }}
              aria-hidden="true"
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
