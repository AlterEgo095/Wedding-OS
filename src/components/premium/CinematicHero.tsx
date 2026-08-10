// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/CinematicHero.tsx
// Phase 2D (MISSION 5.9.0) — Full-bleed cinematic hero.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces HeroSection on the `cinematic-dark` theme. Full-viewport height,
// background image with Ken Burns zoom effect, dark gradient overlay,
// centered couple names in large display font, film-grain texture overlay,
// scroll indicator at the bottom.
//
// Layered structure (z-order):
//   1. Background image (Ken Burns scale 1→1.1 over 20s alternate)
//   2. Dark gradient overlay (top + bottom for legibility)
//   3. SVG film-grain noise overlay at 3% opacity
//   4. Centered content (couple names → date → venue → hashtag) via
//      staggered MotionReveal fade-up
//   5. Bouncing scroll indicator at bottom
//
// Accessibility:
//   - Ken Burns + scroll-indicator bounce + entrance stagger are ALL
//     disabled when `prefers-reduced-motion: reduce` is set.
//   - The background image is decorative (`aria-hidden`); the couple
//     names are rendered in an `<h1>` for screen-reader landmarking.
//   - The film-grain overlay is `aria-hidden` (pure decoration).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MotionReveal } from './MotionReveal';

export interface CinematicHeroProps {
  /** Couple names, e.g. "Josué & Hornella". */
  coupleNames: string;
  /** Wedding date display, e.g. "26 juin 2026". */
  weddingDate?: string;
  /** Venue display, e.g. "Kinshasa". */
  venue?: string;
  /** Background image URL (absolute or root-relative). When null/undefined,
   *  a CSS gradient placeholder is rendered instead of an <Image> — this
   *  prevents leaking the default wedding's photo into tenants that haven't
   *  configured their own. (P0-QW3 fix.) */
  backgroundImage?: string | null;
  /** Optional hashtag, e.g. "#JosuéEtHornella". */
  hashtag?: string;
}

/** Inline SVG noise filter — film grain. ~3% opacity via style. */
const FILM_GRAIN_SVG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

/**
 * CinematicHero — full-bleed cinematic hero for the cinematic-dark theme.
 *
 * @example
 *   <CinematicHero
 *     coupleNames="Josué & Hornella"
 *     weddingDate="26 juin 2026"
 *     venue="Kinshasa"
 *     backgroundImage="/photos/couple-bridge.jpeg"
 *     hashtag="#JosuéEtHornella"
 *   />
 */
export function CinematicHero({
  coupleNames,
  weddingDate,
  venue,
  backgroundImage,
  hashtag,
}: CinematicHeroProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="accueil"
      className="relative min-h-screen w-full overflow-hidden bg-black"
      aria-label="Accueil"
    >
      {/* ─── Layer 1: Ken Burns background ─────────────────────────────── */}
      {/* P0-QW3: when backgroundImage is null/undefined (no couple photo
          configured), render a CSS gradient placeholder instead of an
          <Image>. Previously the caller (IdentityHero) fell back to
          '/couple-hero.jpeg', leaking the default wedding's photo into
          every tenant using the cinematic-dark identity. */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {backgroundImage ? (
          prefersReducedMotion ? (
            <Image
              src={backgroundImage}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.1 }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'easeInOut',
              }}
              className="absolute inset-0"
            >
              <Image
                src={backgroundImage}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover"
              />
            </motion.div>
          )
        ) : (
          /* Gradient placeholder — no background photo configured */
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[#1a1420] to-[#0f0d18]" />
        )}
      </div>

      {/* ─── Layer 2: Dark gradient overlay ─────────────────────────────── */}
      <div
        className="absolute inset-0 z-[1] bg-gradient-to-b from-black/70 via-black/40 to-black/85"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]"
        aria-hidden="true"
      />

      {/* ─── Layer 3: Film-grain texture ────────────────────────────────── */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: FILM_GRAIN_SVG, opacity: 0.03 }}
        aria-hidden="true"
      />

      {/* ─── Layer 4: Centered content ──────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        {/* Pre-title */}
        <MotionReveal preset="fade-up" delay={0.1} className="mb-6">
          <p className="font-display text-sm uppercase tracking-[0.4em] text-white/60">
            Nous nous marions
          </p>
        </MotionReveal>

        {/* Couple names — H1 for landmark */}
        <MotionReveal preset="fade-up" delay={0.3} className="mb-4">
          <h1 className="font-serif text-5xl font-bold text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)] sm:text-6xl md:text-7xl lg:text-8xl">
            {coupleNames}
          </h1>
        </MotionReveal>

        {/* Ornamental divider */}
        <MotionReveal preset="fade-in" delay={0.6} className="mb-6">
          <div className="flex items-center justify-center gap-3" aria-hidden="true">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[var(--gold-light)] sm:w-28" />
            <span className="text-[var(--gold-light)]">✦</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[var(--gold-light)] sm:w-28" />
          </div>
        </MotionReveal>

        {/* Wedding date */}
        {weddingDate && (
          <MotionReveal preset="fade-up" delay={0.8} className="mb-2">
            <p className="font-display text-lg uppercase tracking-[0.25em] text-white/85 sm:text-xl md:text-2xl">
              {weddingDate}
            </p>
          </MotionReveal>
        )}

        {/* Venue */}
        {venue && (
          <MotionReveal preset="fade-up" delay={1.0} className="mb-4">
            <p className="font-display text-base text-white/70 sm:text-lg">
              {venue}
            </p>
          </MotionReveal>
        )}

        {/* Hashtag */}
        {hashtag && (
          <MotionReveal preset="fade-in" delay={1.2}>
            <p className="font-display text-sm uppercase tracking-[0.3em] text-[var(--gold-light)]">
              {hashtag}
            </p>
          </MotionReveal>
        )}
      </div>

      {/* ─── Layer 5: Scroll indicator ──────────────────────────────────── */}
      {prefersReducedMotion ? (
        <div
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-white/50"
          aria-hidden="true"
        >
          <ChevronDown className="size-6" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[10px] font-display uppercase tracking-[0.25em] text-white/50">
              Découvrir
            </span>
            <ChevronDown className="size-6 text-white/60" />
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}

export default CinematicHero;
