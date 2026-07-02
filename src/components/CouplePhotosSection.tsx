'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Heart, Camera, Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PHOTOS = [
  {
    src: '/photos/couple-portrait.jpeg',
    alt: 'Josué & Hornella — Portrait de mariage',
    caption: 'Ensemble pour la vie',
    sub: 'Un amour qui brille comme l\'or',
    span: 'col-span-1 row-span-2',
    aspect: 'aspect-[3/4]',
  },
  {
    src: '/photos/couple-bridge.jpeg',
    alt: 'Josué & Hornella — Sur le pont',
    caption: 'Un moment de grâce',
    sub: 'Enlacés sous le ciel',
    span: 'col-span-1 row-span-1',
    aspect: 'aspect-square',
  },
  {
    src: '/photos/couple-bouquet.jpeg',
    alt: 'Josué & Hornella — Avec le bouquet',
    caption: 'La promesse d\'un toujours',
    sub: 'Chaque fleur raconte notre histoire',
    span: 'col-span-1 row-span-1',
    aspect: 'aspect-square',
  },
  {
    src: '/photos/couple-signing.jpeg',
    alt: 'Josué & Hornella — Signature du mariage',
    caption: 'Le oui qui change tout',
    sub: 'L\'engagement scellé',
    span: 'col-span-1 row-span-1',
    aspect: 'aspect-square',
  },
  {
    src: '/photos/couple-venue.jpeg',
    alt: 'Josué & Hornella — Au venue',
    caption: 'Notre plus beau jour',
    sub: 'Là où tout a commencé',
    span: 'col-span-1 row-span-2',
    aspect: 'aspect-[3/4]',
  },
  {
    src: '/photos/couple-seated.jpeg',
    alt: 'Josué & Hornella — Assis ensemble',
    caption: 'Complicité infinie',
    sub: 'Chaque instant est un trésor',
    span: 'col-span-1 row-span-1',
    aspect: 'aspect-square',
  },
  {
    src: '/photos/couple-storefront.jpeg',
    alt: 'Josué & Hornella — Devant la vitrine',
    caption: 'Bonheur partagé',
    sub: 'Le monde sourit avec nous',
    span: 'col-span-1 row-span-1',
    aspect: 'aspect-square',
  },
]

export default function CouplePhotosSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const openLightbox = (index: number) => setLightboxIndex(index)
  const closeLightbox = () => setLightboxIndex(null)
  const goNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % PHOTOS.length)
    }
  }
  const goPrev = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + PHOTOS.length) % PHOTOS.length)
    }
  }

  return (
    <section
      id="photos"
      ref={sectionRef}
      className="relative py-24 md:py-36 overflow-hidden"
    >
      {/* Background */}
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
              Notre Galerie
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

        {/* ═══ Premium Masonry Photo Grid ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-5 auto-rows-[200px] md:auto-rows-[260px]">
          {PHOTOS.map((photo, i) => (
            <motion.div
              key={photo.src}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
              className={`group relative ${photo.span} cursor-pointer`}
              onClick={() => openLightbox(i)}
            >
              <div className="relative w-full h-full rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] hover:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.4)] transition-shadow duration-700">
                {/* Gold border frame */}
                <div className="absolute inset-0 rounded-2xl md:rounded-3xl z-10 pointer-events-none border border-gold/15 group-hover:border-gold/40 transition-colors duration-500" />

                {/* Photo */}
                <div className={`relative w-full h-full overflow-hidden`}>
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    className="object-cover object-center group-hover:scale-110 transition-transform duration-[1.5s] ease-out"
                    sizes="(max-width: 1024px) 50vw, 33vw"
                  />

                  {/* Cinematic gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

                  {/* Hover sparkle effect */}
                  <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div className="absolute top-3 right-3">
                      <Sparkles className="size-5 text-gold/60 animate-pulse" />
                    </div>
                  </div>

                  {/* Bottom caption */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-20 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                    <h3 className="font-serif text-base md:text-xl font-bold text-white mb-1 drop-shadow-lg">
                      {photo.caption}
                    </h3>
                    <p className="font-display text-xs md:text-sm text-white/60 tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      {photo.sub}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ═══ Elegant Divider ═══ */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
          transition={{ delay: 1.2, duration: 1 }}
          className="flex items-center justify-center gap-4 mt-16 md:mt-24"
        >
          <div className="h-px w-20 sm:w-32 bg-gradient-to-r from-transparent to-gold/40" />
          <div className="w-2 h-2 rounded-full bg-gold/40 animate-pulse-gold" />
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/50 font-bold">J & H</span>
          <div className="w-2 h-2 rounded-full bg-rose-gold/40 animate-pulse-gold" />
          <div className="h-px w-20 sm:w-32 bg-gradient-to-l from-transparent to-gold/40" />
        </motion.div>
      </div>

      {/* ═══ Lightbox ═══ */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-lg"
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-70 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="size-6 text-white" />
            </button>

            {/* Prev button */}
            <button
              onClick={(e) => { e.stopPropagation(); goPrev() }}
              className="absolute left-4 z-70 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="size-6 text-white" />
            </button>

            {/* Next button */}
            <button
              onClick={(e) => { e.stopPropagation(); goNext() }}
              className="absolute right-4 z-70 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="size-6 text-white" />
            </button>

            {/* Image */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative w-[90vw] h-[80vh] max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={PHOTOS[lightboxIndex].src}
                alt={PHOTOS[lightboxIndex].alt}
                fill
                className="object-contain"
                sizes="90vw"
                priority
              />
              {/* Caption */}
              <div className="absolute bottom-0 left-0 right-0 text-center p-6">
                <h3 className="font-serif text-2xl md:text-3xl font-bold text-white mb-1 drop-shadow-lg">
                  {PHOTOS[lightboxIndex].caption}
                </h3>
                <p className="font-display text-sm text-white/60 tracking-wide">
                  {PHOTOS[lightboxIndex].sub}
                </p>
              </div>
            </motion.div>

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-70 font-display text-sm text-white/40 tracking-widest">
              {lightboxIndex + 1} / {PHOTOS.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
