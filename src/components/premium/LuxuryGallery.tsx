// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/LuxuryGallery.tsx
// Phase 2D (MISSION 5.9.0) — Premium masonry gallery.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces PremiumGallery on the `royal-luxury` theme. Masonry layout with
// gold-framed images, hover lift effect, and click-to-open ImmersiveGallery
// lightbox. Uses `next/image` with proper `sizes` attribute per item.
//
// Span presets (`tall` / `normal` / `wide`) control how many grid cells
// each image occupies — implemented via CSS grid `row-span` / `col-span`.
//
// Accessibility:
//   - Each image is wrapped in a `<button>` (focusable) with an aria-label
//     of "Ouvrir l'image: <caption or alt>".
//   - Hover lift + border-color transitions are skipped under
//     prefers-reduced-motion (the caption is always visible, no lift).
//   - The lightbox is rendered via the sibling ImmersiveGallery component.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImmersiveGallery } from './ImmersiveGallery';
import { focalPointToObjectPosition } from '@/lib/image/focal-point';

/** Aspect-ratio / span preset for masonry tiles. */
export type GalleryImageSpan = 'tall' | 'normal' | 'wide';

/**
 * Focal point in normalised [0, 1] coordinates (0,0 = top-left,
 * 1,1 = bottom-right). Couples set this in the admin by clicking on
 * a photo — see `src/lib/image/focal-point.ts`.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface LuxuryGalleryImage {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  span?: GalleryImageSpan;
  /**
   * Optional focal point — when set, the image is cropped with this
   * point as the centre of attention (e.g. the bride's face). When
   * omitted, `object-position: center center` is used.
   */
  focalPoint?: FocalPoint;
}

export interface LuxuryGalleryProps {
  /** Image list. */
  images: LuxuryGalleryImage[];
  /** Number of columns. Default 3. */
  columns?: 2 | 3 | 4;
  /** Optional section heading. */
  heading?: string;
  /** Optional subheading. */
  subheading?: string;
}

/** Map `columns` prop → Tailwind grid-cols class. */
const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
};

/** Map `span` preset → tile class. */
const SPAN_CLASSES: Record<GalleryImageSpan, string> = {
  tall: 'row-span-2 aspect-[3/4]',
  normal: 'row-span-1 aspect-square',
  wide: 'col-span-2 row-span-1 aspect-[16/9]',
};

/** Map `span` preset → next/image `sizes` attribute. */
const SPAN_SIZES: Record<GalleryImageSpan, string> = {
  tall: '(max-width: 768px) 50vw, 33vw',
  normal: '(max-width: 768px) 50vw, 25vw',
  wide: '(max-width: 768px) 100vw, 66vw',
};

/**
 * LuxuryGallery — premium masonry gallery with gold frames + hover lift.
 *
 * @example
 *   <LuxuryGallery
 *     images={images}
 *     columns={3}
 *     heading="Notre galerie"
 *   />
 */
export function LuxuryGallery({
  images,
  columns = 3,
  heading = 'Notre galerie',
  subheading = 'Les plus beaux moments de notre histoire',
}: LuxuryGalleryProps) {
  const prefersReducedMotion = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const immersiveImages = images.map((img) => ({
    id: img.id,
    src: img.src,
    alt: img.alt,
    caption: img.caption,
  }));

  return (
    <section
      id="galerie"
      className="relative overflow-hidden py-20 md:py-32"
      aria-label="Galerie photo"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.8 }}
          className="mb-12 text-center"
        >
          <div className="mb-6 inline-flex size-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--gold-light)/15,var(--rose-gold)/10)]">
            <Camera className="size-7 text-[var(--gold)]" />
          </div>
          <h2 className="mb-4 font-serif text-3xl font-bold md:text-5xl">
            <span className="gold-gradient">{heading}</span>
          </h2>
          <p className="mx-auto max-w-xl font-display text-lg text-muted-foreground">
            {subheading}
          </p>
        </motion.div>

        {/* Masonry grid */}
        <div
          className={cn(
            'grid auto-rows-[180px] gap-3 sm:gap-4 md:auto-rows-[220px]',
            COLUMN_CLASSES[columns],
          )}
        >
          {images.map((img, i) => {
            const span = img.span ?? (i % 5 === 0 ? 'wide' : i % 3 === 0 ? 'tall' : 'normal');
            const tileClass = SPAN_CLASSES[span];
            const sizesAttr = SPAN_SIZES[span];
            const ariaLabel = `Ouvrir l&apos;image : ${img.caption || img.alt}`;

            return (
              <motion.button
                key={img.id}
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={ariaLabel}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.08 }}
                className={cn(
                  'group relative overflow-hidden rounded-lg border-2 border-[var(--gold-light)]/30',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-light)] focus-visible:ring-offset-2',
                  !prefersReducedMotion &&
                    'transition-all duration-300 hover:-translate-y-1 hover:border-[var(--gold-light)]/60 hover:shadow-[var(--shadow-gold)]',
                  tileClass,
                )}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={sizesAttr}
                  style={{ objectPosition: focalPointToObjectPosition(img.focalPoint?.x, img.focalPoint?.y) }}
                  className={cn(
                    'object-cover',
                    !prefersReducedMotion && 'transition-transform duration-700 group-hover:scale-110',
                  )}
                />

                {/* Caption overlay */}
                {img.caption && (
                  <div
                    className={cn(
                      'absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-4',
                      prefersReducedMotion
                        ? 'opacity-100'
                        : 'opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                    )}
                  >
                    <div className="flex items-center gap-2 text-white">
                      <ZoomIn className="size-4 shrink-0" aria-hidden="true" />
                      <span className="font-display text-xs uppercase tracking-wider">
                        {img.caption}
                      </span>
                    </div>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      <ImmersiveGallery
        images={immersiveImages}
        initialIndex={openIndex ?? undefined}
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
      />
    </section>
  );
}

export default LuxuryGallery;
