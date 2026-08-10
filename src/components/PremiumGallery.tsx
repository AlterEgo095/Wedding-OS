'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion'
import type { Easing } from 'framer-motion'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, ZoomIn, Camera } from 'lucide-react'
import DynamicLightSweep from '@/components/effects/DynamicLightSweep'
import { useVisualEffects } from '@/lib/visual-effects-store'
import { focalPointToObjectPosition } from '@/lib/image/focal-point'
import { MotionReveal } from '@/components/premium/MotionReveal'
import { useMotionTier } from '@/lib/motion/useMotionTier'

/**
 * Focal point in normalised [0, 1] coordinates (0,0 = top-left,
 * 1,1 = bottom-right). Couples set this in the admin by clicking on
 * a photo — see `src/lib/image/focal-point.ts`.
 */
export interface FocalPoint {
  x: number
  y: number
}

interface GalleryImage {
  id: string
  url: string
  title?: string | null
  description?: string | null
  category?: string | null
  /**
   * Optional focal point — when set, the grid thumbnail is cropped with
   * this point as the centre of attention. The lightbox view uses
   * `object-contain` (no cropping) so the focal point is only applied
   * to the grid thumbnails.
   */
  focalPoint?: FocalPoint
}

interface PremiumGalleryProps {
  images?: GalleryImage[]
}

// P0-QW3: the previous `defaultPhotos` array (8 hardcoded photos of the
// default wedding — /uploads/couple-photo-1.jpeg, /photos/couple-*.jpeg)
// leaked the default wedding's photos into every tenant's gallery. It has
// been removed. When no images are passed AND /api/media returns nothing,
// the gallery renders a graceful empty state ("Galerie à venir" with a
// Camera icon) instead of the default wedding's photos.

export default function PremiumGallery({ images }: PremiumGalleryProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })
  const prefersReducedMotion = useReducedMotion()
  const { config: motionCfg, reduced: motionTierReduced, tier } = useMotionTier()
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed. `prefersReducedMotion`
  // from framer-motion is preserved for the existing hover-lift gate.
  const isStatic = motionTierReduced || tier === 'none'
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const { premiumButtons } = useVisualEffects()

  // P0-QW3: when no `images` prop is passed, fetch the wedding's real media
  // from /api/media (auto-scoped by the tenant interceptor). When the API
  // returns an empty list (couple hasn't uploaded anything yet), the gallery
  // renders a graceful empty state instead of the default wedding's photos.
  // Backward compatible: if `images` prop is passed, it always wins.
  const [fetchedImages, setFetchedImages] = useState<GalleryImage[]>([])
  const [fetched, setFetched] = useState(false)
  useEffect(() => {
    if (images && images.length > 0) return // explicit prop wins, no fetch
    let cancelled = false
    fetch('/api/media?type=PHOTO&category=GALLERY')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return
        const media = Array.isArray(data?.media) ? data.media : []
        // Only keep photo-type entries (defensive: route already filters by type)
        const galleryImages: GalleryImage[] = media
          .filter((m: { url?: string; type?: string }) => m?.url)
          .map((m: { id: string; url: string; title?: string | null; description?: string | null; category?: string | null }) => ({
            id: m.id,
            url: m.url,
            title: m.title ?? null,
            description: m.description ?? null,
            category: m.category ?? null,
          }))
        setFetchedImages(galleryImages)
        setFetched(true)
      })
      .catch(() => {
        // Network error — mark as fetched so the empty state can render
        // instead of leaving the gallery stuck on a perpetual loading state.
        if (!cancelled) setFetched(true)
      })
    return () => { cancelled = true }
  }, [images])

  // P0-QW3: `defaultPhotos` was removed — when neither the `images` prop nor
  // the /api/media fetch yields any photos, render a graceful empty state
  // ("Galerie à venir") instead of leaking the default wedding's photos.
  const photos = images && images.length > 0
    ? images.map(img => ({ id: img.id, url: img.url, title: img.title || '', category: img.category || '', focalPoint: img.focalPoint }))
    : fetchedImages.length > 0
      ? fetchedImages.map(img => ({ id: img.id, url: img.url, title: img.title || '', category: img.category || '', focalPoint: img.focalPoint }))
      : []

  const openLightbox = (index: number) => setSelectedIndex(index)
  const closeLightbox = () => setSelectedIndex(null)
  const goNext = () => {
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex + 1) % photos.length)
    }
  }
  const goPrev = () => {
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex - 1 + photos.length) % photos.length)
    }
  }

  return (
    <section ref={sectionRef} id="galerie" className="py-20 md:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/3 to-background" />
      <DynamicLightSweep duration={18} opacity={0.03} direction="left-to-right" />

      <MotionReveal preset="fade-up" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 30 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
          className="text-center mb-12"
        >
          <motion.div
            initial={isStatic ? false : { opacity: 0, scale: 0.8 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, scale: 1 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6"
          >
            <Camera className="size-7 text-gold" />
          </motion.div>
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Notre Galerie</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Les plus beaux moments de notre histoire
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Photo Grid — Masonry-style (only when photos exist) */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                initial={isStatic ? false : { opacity: 0, y: 20 }}
                animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
                transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.1 * Math.min(i, 8) }}
                className={`relative group cursor-pointer overflow-hidden rounded-xl ${
                  i === 0 || i === 5 ? 'col-span-2 row-span-2' : ''
                } ${
                  // Phase 3D #7: subtle hover lift + gold shadow on the gallery
                  // tile. Gated by prefers-reduced-motion (no transform/shadow
                  // transition under reduced motion — the image still zooms
                  // because that's a per-element transition, but the tile itself
                  // doesn't translate).
                  !prefersReducedMotion
                    ? 'transition-transform duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-gold)]'
                    : ''
                }`}
                onClick={() => openLightbox(i)}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className={`relative overflow-hidden rounded-xl ${
                  i === 0 || i === 5 ? 'aspect-square' : 'aspect-[4/3]'
                }`}>
                  <Image
                    src={photo.url}
                    alt={photo.title || 'Photo du couple'}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    style={{ objectPosition: focalPointToObjectPosition(photo.focalPoint?.x, photo.focalPoint?.y) }}
                    sizes={i === 0 || i === 5 ? '(max-width: 768px) 50vw, 50vw' : '(max-width: 768px) 50vw, 25vw'}
                  />

                  {/* Hover overlay */}
                  <motion.div
                    initial={false}
                    animate={{ opacity: hoveredIndex === i ? 1 : 0 }}
                    transition={isStatic ? { duration: 0 } : { duration: 0.3 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center card-premium"
                  >
                    <div className="text-center">
                      <ZoomIn className="size-6 text-white/80 mx-auto mb-2" />
                      {photo.title && (
                        <p className="font-display text-xs text-white/70 tracking-wider uppercase">{photo.title}</p>
                      )}
                    </div>
                  </motion.div>

                  {/* Gold border on hover */}
                  <motion.div
                    initial={false}
                    animate={{ opacity: hoveredIndex === i ? 1 : 0 }}
                    transition={isStatic ? { duration: 0 } : undefined}
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      boxShadow: 'inset 0 0 0 2px rgba(196,162,101,0.5)',
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* P0-QW3: graceful empty state — no `images` prop AND /api/media
             returned no photos. Previously the gallery rendered the default
             wedding's 8 photos (`defaultPhotos`); now it shows a tasteful
             "Galerie à venir" placeholder. The `fetched` guard ensures we
             don't flash the empty state during the initial fetch. */
          fetched && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gold/10 to-rose-gold/5 mb-6">
                <Camera className="size-9 text-gold/50" />
              </div>
              <p className="font-serif text-2xl md:text-3xl font-bold mb-3">
                <span className="gold-gradient">Galerie à venir</span>
              </p>
              <p className="font-display text-sm text-muted-foreground max-w-md">
                Les photos du couple apparaîtront ici dès qu&apos;elles seront partagées.
              </p>
            </div>
          )
        )}
      </MotionReveal>

      {/* ═══ LIGHTBOX ═══ */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            initial={isStatic ? false : { opacity: 0 }}
            animate={isStatic ? undefined : { opacity: 1 }}
            exit={isStatic ? undefined : { opacity: 0 }}
            transition={isStatic ? { duration: 0 } : { duration: 0.3 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center"
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors btn-premium gold-shimmer-hover"
              aria-label="Fermer"
            >
              <X className="size-5 text-white" />
            </button>

            {/* Navigation */}
            <button
              onClick={(e) => { e.stopPropagation(); goPrev() }}
              className="absolute left-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors btn-premium gold-shimmer-hover"
              aria-label="Précédent"
            >
              <ChevronLeft className="size-5 text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goNext() }}
              className="absolute right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors btn-premium gold-shimmer-hover"
              aria-label="Suivant"
            >
              <ChevronRight className="size-5 text-white" />
            </button>

            {/* Image */}
            <motion.div
              key={selectedIndex}
              initial={isStatic ? false : { opacity: 0, scale: 0.9 }}
              animate={isStatic ? undefined : { opacity: 1, scale: 1 }}
              exit={isStatic ? undefined : { opacity: 0, scale: 0.9 }}
              transition={isStatic ? { duration: 0 } : { duration: 0.3 }}
              className="relative max-w-5xl max-h-[85vh] w-full mx-8"
              style={{ border: '1px solid oklch(0.68 0.12 85 / 20%)', borderRadius: '0.5rem' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full aspect-[16/10]">
                <Image
                  src={photos[selectedIndex].url}
                  alt={photos[selectedIndex].title || 'Photo'}
                  fill
                  className="object-contain"
                  sizes="90vw"
                  priority
                />
              </div>
              {photos[selectedIndex].title && (
                <p className="text-center mt-3 font-display text-sm text-white/60 tracking-wider uppercase">
                  {photos[selectedIndex].title}
                </p>
              )}
            </motion.div>

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-display text-xs text-white/40 tracking-wider">
              {selectedIndex + 1} / {photos.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
