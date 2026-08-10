// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/ImmersiveGallery.tsx
// Phase 2D (MISSION 5.9.0) — Fullscreen immersive gallery lightbox.
// ══════════════════════════════════════════════════════════════════════════════
//
// Fullscreen overlay with:
//   - Swipe left/right (touch)
//   - Arrow keys (←/→) for keyboard navigation
//   - Escape to close
//   - Pinch-zoom on mobile (CSS `touch-action: pinch-zoom`)
//   - Caption at bottom
//   - Counter (N / M) at top
//   - Image preloads for next/prev
//   - Respects prefers-reduced-motion (no transition animations, instant switch)
//
// French labels: "Fermer", "Image précédente", "Image suivante".
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ImmersiveGalleryImage {
  id: string;
  src: string;
  alt: string;
  caption?: string;
}

export interface ImmersiveGalleryProps {
  /** Image list. */
  images: ImmersiveGalleryImage[];
  /** Initial index when `open` becomes true. */
  initialIndex?: number;
  /** Whether the overlay is currently open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
}

/** Minimum horizontal swipe distance (px) before treating as a navigation. */
const SWIPE_THRESHOLD = 50;

/**
 * ImmersiveGallery — fullscreen lightbox with swipe/keyboard/pinch-zoom.
 *
 * @example
 *   const [open, setOpen] = useState<number | null>(null);
 *   <ImmersiveGallery
 *     images={images}
 *     initialIndex={open ?? undefined}
 *     open={open !== null}
 *     onClose={() => setOpen(null)}
 *   />
 */
export function ImmersiveGallery({
  images,
  initialIndex = 0,
  open,
  onClose,
}: ImmersiveGalleryProps) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Sync local index with `initialIndex` whenever the overlay opens.
  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const goNext = useCallback(() => {
    if (images.length === 0) return;
    setIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    if (images.length === 0) return;
    setIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard nav: Escape closes, arrows navigate.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, goNext, goPrev]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Touch handlers — swipe left = next, swipe right = prev.
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.changedTouches[0]?.clientX ?? null);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStart;
    const delta = endX - touchStart;
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      if (delta < 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  if (!open || images.length === 0) return null;

  const current = images[index];

  // Preload neighbours (next/prev) by rendering hidden <Image> tags.
  const nextImg = images[(index + 1) % images.length];
  const prevImg = images[(index - 1 + images.length) % images.length];

  return (
    <AnimatePresence>
      <motion.div
        key="immersive-overlay"
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
        style={{ touchAction: 'pinch-zoom' }}
        onClick={onClose}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Visionneuse d'images en plein écran"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-4 top-4 z-50 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 min-h-[44px] min-w-[44px]"
          aria-label="Fermer"
        >
          <X className="size-5" />
        </button>

        {/* Prev button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 z-50 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 min-h-[44px] min-w-[44px]"
          aria-label="Image précédente"
        >
          <ChevronLeft className="size-6" />
        </button>

        {/* Next button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 z-50 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 min-h-[44px] min-w-[44px]"
          aria-label="Image suivante"
        >
          <ChevronRight className="size-6" />
        </button>

        {/* Counter */}
        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 font-display text-xs uppercase tracking-wider text-white/60">
          {index + 1} / {images.length}
        </div>

        {/* Current image */}
        <div
          className="relative h-[90vh] w-[90vw] max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 0, scale: 0.95 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="relative h-full w-full"
            >
              <Image
                src={current.src}
                alt={current.alt}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </motion.div>
          </AnimatePresence>

          {/* Caption */}
          {current.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-center">
              <p className="font-display text-sm uppercase tracking-wider text-white/80">
                {current.caption}
              </p>
            </div>
          )}
        </div>

        {/* Hidden preloads — keep next/prev images warm in the browser cache. */}
        <div className="hidden" aria-hidden="true">
          <Image src={nextImg.src} alt="" width={1} height={1} />
          <Image src={prevImg.src} alt="" width={1} height={1} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ImmersiveGallery;
