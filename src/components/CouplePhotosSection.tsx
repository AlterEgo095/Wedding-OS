'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { motion, useInView } from 'framer-motion'
import { Heart, Camera, Sparkles } from 'lucide-react'

export default function CouplePhotosSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })

  return (
    <section
      id="photos"
      ref={sectionRef}
      className="relative py-24 md:py-36 overflow-hidden"
    >
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-black/[0.02] to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.68_0.12_85/5%),transparent_50%),radial-gradient(ellipse_at_bottom_left,oklch(0.72_0.08_30/5%),transparent_50%)]" />

      {/* Decorative borders */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16 md:mb-24"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gold/20 bg-gold/5 mb-6"
          >
            <Camera className="size-4 text-gold/70" />
            <span className="font-display text-xs sm:text-sm tracking-[0.2em] uppercase text-gold/70 font-semibold">
              Nos Moments
            </span>
          </motion.div>
          <h2 className="font-serif text-4xl md:text-6xl font-bold mb-4">
            <span className="gold-gradient">Josué & Hornella</span>
          </h2>
          <p className="font-display text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
            L&apos;amour en images, chaque moment capturé avec tendresse
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <Heart className="size-4 text-gold/40" />
          </div>
        </motion.div>

        {/* ═══ Premium Photo Grid ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 lg:gap-10">
          
          {/* Photo 1 - Large Cinematic Card */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 1, delay: 0.3 }}
            className="group relative"
          >
            <div className="relative rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] hover:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.4)] transition-shadow duration-700">
              {/* Gold border frame */}
              <div className="absolute inset-0 rounded-2xl md:rounded-3xl z-10 pointer-events-none border border-gold/20 group-hover:border-gold/40 transition-colors duration-500" />
              
              {/* Photo */}
              <div className="relative aspect-[3/4] md:aspect-[4/5] overflow-hidden">
                <Image
                  src="/couple-hero.png"
                  alt="Josué & Hornella — Ensemble pour la vie"
                  fill
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-[1.5s] ease-out"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
                {/* Cinematic bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Floating badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.8, duration: 0.6 }}
                  className="absolute top-4 left-4 z-20 glass-card px-4 py-2 rounded-full border border-gold/20"
                >
                  <span className="font-display text-xs tracking-[0.15em] uppercase text-white/80 font-semibold flex items-center gap-2">
                    <Sparkles className="size-3 text-gold/60" />
                    Mariage 2026
                  </span>
                </motion.div>

                {/* Bottom caption */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 z-20">
                  <h3 className="font-serif text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-lg">
                    Ensemble pour la vie
                  </h3>
                  <p className="font-display text-sm md:text-base text-white/70 tracking-wide">
                    Un amour qui brille comme l&apos;or
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Photo 2 - Large Cinematic Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 1, delay: 0.5 }}
            className="group relative"
          >
            <div className="relative rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] hover:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.4)] transition-shadow duration-700">
              {/* Rose-gold border frame */}
              <div className="absolute inset-0 rounded-2xl md:rounded-3xl z-10 pointer-events-none border border-rose-gold/20 group-hover:border-rose-gold/40 transition-colors duration-500" />
              
              {/* Photo */}
              <div className="relative aspect-[3/4] md:aspect-[4/5] overflow-hidden">
                <Image
                  src="/couple-moment.jpeg"
                  alt="Josué & Hornella — Un moment de complicité"
                  fill
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-[1.5s] ease-out"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
                {/* Cinematic bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Floating badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 1.0, duration: 0.6 }}
                  className="absolute top-4 right-4 z-20 glass-card px-4 py-2 rounded-full border border-rose-gold/20"
                >
                  <span className="font-display text-xs tracking-[0.15em] uppercase text-white/80 font-semibold flex items-center gap-2">
                    <Heart className="size-3 text-rose-gold/60 fill-rose-gold/30" />
                    Pour toujours
                  </span>
                </motion.div>

                {/* Bottom caption */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 z-20">
                  <h3 className="font-serif text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-lg">
                    Un moment de complicité
                  </h3>
                  <p className="font-display text-sm md:text-base text-white/70 tracking-wide">
                    Chaque instant ensemble est un trésor
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ═══ Elegant Divider ═══ */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
          transition={{ delay: 0.8, duration: 1 }}
          className="flex items-center justify-center gap-4 mt-16 md:mt-24"
        >
          <div className="h-px w-20 sm:w-32 bg-gradient-to-r from-transparent to-gold/40" />
          <div className="w-2 h-2 rounded-full bg-gold/40 animate-pulse-gold" />
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/50 font-bold">J & H</span>
          <div className="w-2 h-2 rounded-full bg-rose-gold/40 animate-pulse-gold" />
          <div className="h-px w-20 sm:w-32 bg-gradient-to-l from-transparent to-gold/40" />
        </motion.div>
      </div>
    </section>
  )
}
