'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Heart, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface CoupleStory {
  id: string
  title: string
  description: string
  date?: string | null
  imageUrl?: string | null
  order: number
}

const gradientColors = [
  'from-rose-gold/20 to-gold-light/10',
  'from-gold-light/20 to-champagne/10',
  'from-rose-100/30 to-amber-100/10 dark:from-rose-900/10 dark:to-amber-900/5',
  'from-amber-100/20 to-rose-100/10 dark:from-amber-900/10 dark:to-rose-900/5',
  'from-champagne/20 to-cream/10',
]

export default function CoupleGallery({ stories }: { stories: CoupleStory[] }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 360
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  if (!stories || stories.length === 0) {
    return (
      <section id="histoire" ref={sectionRef} className="py-20 md:py-32 bg-gradient-warm relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Notre Histoire</span>
          </h2>
          <div className="section-divider max-w-xs mx-auto my-6">
            <span className="flourish text-sm">✦</span>
          </div>
          <p className="font-display text-lg text-muted-foreground">
            Notre histoire d&apos;amour sera bientôt révélée...
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="histoire" ref={sectionRef} className="py-20 md:py-32 bg-gradient-warm relative">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Notre Histoire</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Les moments qui ont façonné notre amour
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <Heart className="size-4 text-gold/40" />
          </div>
        </motion.div>

        {/* Carousel controls */}
        <div className="flex justify-end gap-2 mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('left')}
            className="border-gold/20 hover:border-gold/40 hover:bg-gold/5 text-gold/60 hover:text-gold rounded-full"
            aria-label="Précédent"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('right')}
            className="border-gold/20 hover:border-gold/40 hover:bg-gold/5 text-gold/60 hover:text-gold rounded-full"
            aria-label="Suivant"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Horizontal Scrolling Timeline */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-thin"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {stories.map((story, i) => (
            <motion.div
              key={story.id}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.12, duration: 0.6 }}
              className="snap-center shrink-0 w-[320px] sm:w-[360px]"
            >
              <div className="glass-card gold-border rounded-2xl overflow-hidden h-full group hover:shadow-xl hover:shadow-gold/5 transition-all duration-500">
                {/* Image / Gradient */}
                <div
                  className={`h-48 bg-gradient-to-br ${
                    gradientColors[i % gradientColors.length]
                  } relative overflow-hidden`}
                >
                  {story.imageUrl ? (
                    <img
                      src={story.imageUrl}
                      alt={story.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="size-12 text-gold/20 animate-pulse-gold" />
                    </div>
                  )}
                  {/* Date badge */}
                  {story.date && (
                    <div className="absolute top-3 right-3 glass-card px-3 py-1.5 rounded-full">
                      <span className="text-xs font-display flex items-center gap-1.5 text-foreground/80">
                        <CalendarDays className="size-3" />
                        {story.date}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Connection dot */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-gold animate-pulse-gold" />
                    <div className="h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
                  </div>

                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    {story.title}
                  </h3>
                  <p className="font-display text-sm text-muted-foreground leading-relaxed line-clamp-4">
                    {story.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Connection line */}
        <div className="mt-8 flex justify-center">
          <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>
      </div>
    </section>
  )
}

export function CoupleGallerySkeleton() {
  return (
    <section className="py-20 md:py-32 bg-gradient-warm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-5 w-48 mx-auto" />
        </div>
        <div className="flex gap-6 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shrink-0 w-[340px]">
              <div className="glass-card rounded-2xl overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <div className="p-6 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
