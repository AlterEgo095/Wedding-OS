'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, ZoomIn, Camera } from 'lucide-react'
import DynamicLightSweep from '@/components/effects/DynamicLightSweep'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface GalleryImage {
  id: string
  url: string
  title?: string | null
  description?: string | null
  category?: string | null
}

interface PremiumGalleryProps {
  images?: GalleryImage[]
}

const defaultPhotos = [
  { id: '1', url: '/uploads/couple-photo-1.jpeg', title: 'Ensemble', category: 'COUPLE' },
  { id: '2', url: '/uploads/couple-photo-2.jpeg', title: 'Notre Moment', category: 'COUPLE' },
  { id: '3', url: '/photos/couple-bridge.jpeg', title: 'Le Pont', category: 'COUPLE' },
  { id: '4', url: '/photos/couple-bouquet.jpeg', title: 'Le Bouquet', category: 'COUPLE' },
  { id: '5', url: '/photos/couple-seated.jpeg', title: 'Assis Ensemble', category: 'COUPLE' },
  { id: '6', url: '/photos/couple-portrait.jpeg', title: 'Portrait', category: 'COUPLE' },
  { id: '7', url: '/photos/couple-storefront.jpeg', title: 'Vitrine', category: 'COUPLE' },
  { id: '8', url: '/photos/couple-venue.jpeg', title: 'Le Lieu', category: 'COUPLE' },
]

export default function PremiumGallery({ images }: PremiumGalleryProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const { premiumButtons } = useVisualEffects()

  // Consolidation fix: when no explicit `images` prop is passed, fetch the
  // wedding's real media from /api/media (auto-scoped by the tenant
  // interceptor). Falls back to `defaultPhotos` only when the API returns
  // an empty list (e.g. couple hasn't uploaded anything yet).
  // Backward compatible: if `images` prop is passed, it always wins.
  const [fetchedImages, setFetchedImages] = useState<GalleryImage[]>([])
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
      })
      .catch(() => {
        // Silent fallback to defaultPhotos — network errors shouldn't crash the gallery
      })
    return () => { cancelled = true }
  }, [images])

  const photos = images && images.length > 0
    ? images.map(img => ({ id: img.id, url: img.url, title: img.title || '', category: img.category || '' }))
    : fetchedImages.length > 0
      ? fetchedImages.map(img => ({ id: img.id, url: img.url, title: img.title || '', category: img.category || '' }))
      : defaultPhotos

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
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

        {/* Photo Grid — Masonry-style */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 * Math.min(i, 8) }}
              className={`relative group cursor-pointer overflow-hidden rounded-xl ${
                i === 0 || i === 5 ? 'col-span-2 row-span-2' : ''
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
                  sizes={i === 0 || i === 5 ? '(max-width: 768px) 50vw, 50vw' : '(max-width: 768px) 50vw, 25vw'}
                />

                {/* Hover overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: hoveredIndex === i ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: hoveredIndex === i ? 1 : 0 }}
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{
                    boxShadow: 'inset 0 0 0 2px rgba(196,162,101,0.5)',
                  }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ═══ LIGHTBOX ═══ */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
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
