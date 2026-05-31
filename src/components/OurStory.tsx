'use client'

import { useRef } from 'react'
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

export default function OurStory({ stories }: OurStoryProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  // Predefined milestones if no custom stories
  const milestones = stories.length > 0 ? stories : [
    { id: '1', title: 'Première Rencontre', description: 'Le destin a croisé nos chemins et rien n\'a plus jamais été pareil.', date: null, imageUrl: null, order: 0 },
    { id: '2', title: 'Premier Rendez-vous', description: 'Un café, un sourire, et la certitude que nous étions faits l\'un pour l\'autre.', date: null, imageUrl: null, order: 1 },
    { id: '3', title: 'La Demande', description: 'Un genou à terre, un anneau et un oui qui a changé nos vies.', date: null, imageUrl: null, order: 2 },
    { id: '4', title: 'Notre Mariage', description: 'Le jour où nos deux familles ne feront plus qu\'une.', date: '26 Juin 2026', imageUrl: null, order: 3 },
  ]

  const storyIcons = ['💕', '☕', '💍', '💒']
  const storyColors = [
    { bg: 'rgba(176,90,90,0.08)', border: 'rgba(176,90,90,0.2)', accent: '#B05A5A' },
    { bg: 'rgba(196,162,101,0.08)', border: 'rgba(196,162,101,0.2)', accent: '#C4A265' },
    { bg: 'rgba(139,105,20,0.08)', border: 'rgba(139,105,20,0.2)', accent: '#8B6914' },
    { bg: 'rgba(90,139,90,0.08)', border: 'rgba(90,139,90,0.2)', accent: '#5A8B5A' },
  ]

  return (
    <section ref={sectionRef} id="notre-histoire" className="py-20 md:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/3 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.12_85/0.03),transparent_60%)]" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6"
          >
            <Heart className="size-7 text-gold fill-gold/20" />
          </motion.div>
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Notre Histoire</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Un amour qui grandit chaque jour, une promesse d&apos;éternité
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Central line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-gold/30 to-transparent hidden md:block" />

          {milestones.map((milestone, i) => {
            const isLeft = i % 2 === 0
            const colors = storyColors[i % storyColors.length]
            const icon = storyIcons[i % storyIcons.length]

            return (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, x: isLeft ? -40 : 40 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.2 }}
                className={`relative flex items-center mb-12 md:mb-16 last:mb-0 ${
                  isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Content Card */}
                <div className={`w-full md:w-[45%] ${isLeft ? 'md:pr-8' : 'md:pl-8'}`}>
                  <div
                    className="relative p-5 sm:p-6 rounded-xl transition-all duration-300 hover:shadow-lg group"
                    style={{
                      background: `linear-gradient(135deg, ${colors.bg}, rgba(196,162,101,0.04))`,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    {/* Icon + Date row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{icon}</span>
                      {milestone.date && (
                        <span className="font-display text-[9px] tracking-[0.15em] uppercase font-bold" style={{ color: colors.accent }}>
                          <Calendar className="size-3 inline mr-1" />
                          {milestone.date}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="font-serif text-lg sm:text-xl font-bold mb-2" style={{ color: colors.accent }}>
                      {milestone.title}
                    </h3>

                    {/* Description */}
                    <p className="font-display text-sm text-muted-foreground/80 leading-relaxed">
                      {milestone.description}
                    </p>

                    {/* Photo if available */}
                    {milestone.imageUrl && (
                      <div className="mt-3 relative w-full h-40 rounded-lg overflow-hidden">
                        <Image
                          src={milestone.imageUrl}
                          alt={milestone.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 45vw"
                        />
                      </div>
                    )}

                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ boxShadow: `0 0 20px ${colors.border}` }}
                    />
                  </div>
                </div>

                {/* Central dot */}
                <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full items-center justify-center z-10"
                  style={{
                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.border})`,
                    boxShadow: `0 0 12px ${colors.border}`,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

                {/* Spacer for other side */}
                <div className="hidden md:block md:w-[45%]" />
              </motion.div>
            )
          })}
        </div>

        {/* Bottom flourish */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="text-center mt-12"
        >
          <div className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-gold/40" />
            <span className="font-display text-xs tracking-[0.2em] uppercase text-muted-foreground/50">
              Et maintenant, c&apos;est à nous d&apos;écrire la suite
            </span>
            <Sparkles className="size-4 text-gold/40" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
